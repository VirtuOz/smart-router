/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */

require('jsclass');
JS.require('JS.Class');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var https = require('https');
var Io = require('socket.io');
var Amqp = require('amqp');
var CONFIG = require('config');
var logger = require('../util/logger');
var QUEUEFLAG = require('./const').QUEUEFLAG;
var NagiosCheckResponse = require('nagios').NagiosCheckResponse;
var NagiosCheckResponseCodes = require('nagios').NagiosCheckResponseCodes;
var util = require('util');

/**
 * Constant denoting this module as a Nagios check subsystem.
 * @type {string}
 */
var EVENTS_CONTROLLER_SUBSYSTEM = "EventsController";

module.exports = new JS.Class(EventEmitter, {
  initialize: function () {
    EventEmitter.call(this);
    this.io = {};
    this.amqp = {};
    this.config = {};
    // Keep references of all opened connections (We need multiple connections because each is limited to 65536 channels)
    this.amqpConnections = [];
    this.MAX_CHANNEL_PER_CONNECTION = CONFIG.maxChannelPerConnection || 64000;
    /**
    * Holds the Nagios responses we return for the next check.  Is replaced after each Nagios check.
    */
    this._nagiosEvents= [];
    /**
     * Before unsubscribing to a queue, we store the consumer data here.
     * We will delete it only after receiving the RabbitMQ callback.
     * Otherwise, is case of RabbitMQ error during the unsubscribe, we will have a ghost consumer
     * which will never be removed, and will steal messages for the real consumer
     * (if a real consumer reconnect on the queue).
     */
    this._consumersWaitingForUnsubscription = [];
  },

  /**
   * start: starts the SmartRouter
   *
   */
  start: function (config) {
    logger.info(util.format('Starting SmartRouter... Will listen on port %s', config.port));
    logger.info(util.format('Using https: %s', CONFIG.https.use));
    logger.info(util.format('RabbitMQ url is set to %s', config.amqp.url));
    logger.debug('Max Channel per RabbitMQ Connection: ', this.MAX_CHANNEL_PER_CONNECTION);
    var self = this;
    self.config = config;
    self.reconnectDelay = CONFIG.rabbitmqReconnectDelay || 10000;
    self.delayBeforeDeletingInactiveQueue = CONFIG.delayBeforeDeletingInactiveQueue || (15 * 60 * 1000); // 15min by default
    logger.info('Delay before deleting inactive queues: ' + self.delayBeforeDeletingInactiveQueue);

    self.amqp = self._createAmqpConnection();

    self.amqp.once('ready', function() {
      logger.info('Starting Socket.IO server...');
      if (CONFIG.https.use) {
        var options = {
          pfx: fs.readFileSync(CONFIG.https.pfx_path),
          passphrase: CONFIG.https.pfx_passphrase
        };
        self.io = Io.listen(https.createServer(options).listen(+config.port));
      }
      else {
        self.io = Io.listen(+config.port);
      }
      self._configureIo();
      self.registerEndpoints();
      self.listenForNewEndpoints();
      self.started = true;
      self.emit('started');
    });
  },

  stop: function()
  {
    logger.info('Stopping smartrouter');
    var self = this;
    self.started = false;
    self.io.server.close();
    self.io.server.once('close', function () {
      logger.debug('socket server closed');
      setTimeout(function() {
        self.amqpConnections.forEach(function(amqp) {
          amqp.end();
        });
      }, 100); // Let time to the clients' queues to unsubscribe from RabbitMQ
    });
    var lastConnection = self.amqpConnections[self.amqpConnections.length - 1];
    lastConnection.once('close', function () {
      self.emit('stopped');
    });
  },

  nagiosCheck: function(next)
  {
      // Use the response we've built since the last check.
      var response = this._nagiosEvents;
      this._nagiosEvents = [];

      if (response.length == 0)
      {
          response.push(new NagiosCheckResponse(NagiosCheckResponseCodes.OK, EVENTS_CONTROLLER_SUBSYSTEM, "0 OK 0:1"));
      }

      // Continue to the next response.
      next(undefined, response);
  },

  _storeNagiosEvent: function(event)
    {
        if (this._nagiosEvents.length == CONFIG.nagios.maximumNumberOfEventsToKeep)
        {
            // Our event list is too big now.  We get rid of the first (oldest) event.
            this._nagiosEvents.shift();
        }

        this._nagiosEvents.push(event);
    },

  _configureIo: function() {
    var self = this;
    self.io.configure('production', function(){
      self.io.enable('browser client etag');
      self.io.set('log level', 1);

      self.io.set('transports', [
        'websocket'
        , 'flashsocket'
        , 'htmlfile'
        , 'xhr-polling'
        , 'jsonp-polling'
      ]);
    });

    self.io.configure('development', function(){
      self.io.set('transports', ['websocket']);
      self.io.set('log level', 1);
    });
  },

  /**
   * This method will register a listener on the root endpoint ('/') for the event 'registerNewEndpointId'.
   * It allows processes to register new sub endpoints in the smart-router.
   * To do that, connect a socket.io client on the smart-router address and emit a 'registerNewEndpointId'
   * with the following JSON object: { name: 'endpointname', id: endpointid }.
   *
   * Note that it is only possible to register new sub-endpoints for and existing endpoint,
   * not to create a new endpoint with its routes.
   */
  listenForNewEndpoints: function () {
    var self = this;
    self.io.sockets.on('connection', function (socket) {
      socket.on('registerNewEndpointId', function(newEndpoint) {
        var endpointFound = false;
        logger.info(util.format('Request received to register new Endpoint: %s', JSON.stringify(newEndpoint)));
        self.config.endpoints.forEach(function (endpoint) {
          if (endpoint.name === newEndpoint.name) {
            endpointFound = true;
            if (endpoint.sub.indexOf(newEndpoint.id) < 0) {
              var socketendpoint = self.io.of('/' + newEndpoint.name + '/' + newEndpoint.id);
              logger.info(util.format('Endpoint registered on [/%s/%s]', newEndpoint.name, newEndpoint.id));
              self.registerRoutes(newEndpoint.name, newEndpoint.id, endpoint.queue, socketendpoint);

              endpoint.sub.push(newEndpoint.id); // Adding the new ID to the existing configuration.
              logger.info(util.format('Current config is now: %s', JSON.stringify(self.config)));
              socket.emit('endpointRegistered', {});
            }
            else {
              // Endpoint already exists
              var warnMsg = util.format('Endpoint [/%s/%s] already exists. Aborted.', newEndpoint.name, newEndpoint.id);
              logger.warn(warnMsg);
              self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.WARNING, EVENTS_CONTROLLER_SUBSYSTEM, warnMsg));
              socket.emit('endpointRegistered', new Error(warnMsg));
            }
          }
        });
        if (!endpointFound) {
          var errMsg = util.format('[%s] is not a valid Endpoint.', newEndpoint.name);
          logger.error(errMsg);
          self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, EVENTS_CONTROLLER_SUBSYSTEM, errMsg));
          socket.emit('endpointRegistrationError', new Error(errMsg));
        }
      });
    });
  },

  /**
   * registerEndpoints: register bindings for the endpoints.
   *
   */
  registerEndpoints: function () {
    var self = this;
    self.config.endpoints.forEach(function (endpoint) {
      logger.info(util.format('Registering endpoint %s', endpoint.name));
      endpoint.sub = endpoint.sub || endpoint.ids; // backward compatibility....
      if (endpoint.sub.length === 0) {
        var socketendpoint = self.io.of('/' + endpoint.name);
        logger.info(util.format('Endpoint registered on [/%s]', endpoint.name));
        self.registerRoutes(endpoint.name, '', endpoint.queue, socketendpoint);
      } else {
        endpoint.sub.forEach(function (sub) {
          var socketendpoint = self.io.of(util.format('/%s/%s', endpoint.name, sub));
          logger.info(util.format('Endpoint registered on [/%s/%s]', endpoint.name, sub));
          self.registerRoutes(endpoint.name, sub, endpoint.queue, socketendpoint);
        });
      }
    });
  },

  /**
   * registerRoutes
   */
  registerRoutes: function (endpointname, endpointid, queuebehaviour, socketep) {
    var self = this;
    socketep.on('connection', function (socket) {
      logger.info(util.format('Connection received on /%s/%s', endpointname, endpointid));
      socket.emit('whoareyou', {});
      socket.on('iam', function (actorid) {
        socket.set('actorid', actorid, function () {
          logger.info(util.format('Registered actor [%s]. Handshaking.', actorid));
          socket.emit('hello', {});
        });
        var endpointQueue = endpointname + '/' + endpointid;
        if (!queuebehaviour || ((queuebehaviour & QUEUEFLAG.actor) > 0)) {
          self.queueSubscribe(actorid, socket);
        }
        if ((queuebehaviour & QUEUEFLAG.endpoint) > 0) {
          self.queueSubscribe(endpointQueue, socket);
        }
      });
      socket.on('disconnect', function () {
        self.queuesUnsubscribe(socket);
      });
      self.config.routes.forEach( function (route) {
        if (route.endpoint === '*' || route.endpoint === endpointname) {
          logger.debug(util.format('Registering route [%s] for endpoint [%s]. Socket= %s', route.messagetype, route.endpoint, socket.id));
          socket.on(route.messagetype, function (message) {
            self.check(socket, route.messagetype, message, function (err, checked) {
              if (err) {
                logger.error(err);
              }
              if (checked) {
                logger.debug(util.format("Routing '%s' from [%s]. Message=%s", route.messagetype, endpointname, JSON.stringify(message)));
                route.action(message, socket, self);
              }
            });
          });
        }
      });
    });
  },
  /**
   * queueSubscribe: subscribe to the right queue
   *
   */
  queueSubscribe: function (queuename, socket) {
    logger.info(util.format('Subscribing to queue. QueueName=%s; Socket=%s', queuename, socket.id));
    var self = this;
    self.amqp.queue(queuename, { autoDelete: false, closeChannelOnUnsubscribe: true,
                                 arguments: { 'x-expires': self.delayBeforeDeletingInactiveQueue } }, function (q) {
      q.bind(queuename);
      q.subscribe(function (message, headers, deliveryInfo) {
        logger.debug(util.format("Emitting '%s' from queue [%s] on socket %s", message.type, queuename, socket.id));
        socket.emit(message.type, message.message);
      })
      .addCallback(function (ok) {
        var data = { queue: q, ctag: ok.consumerTag };
        logger.debug(util.format('Registering consumerTag [%s] for queue [%s] in socket %s', ok.consumerTag, queuename, socket.id));
        socket.get('queueData', function (err, queueData) {
          queueData = queueData || [];
          queueData.push(data);
          socket.set('queueData',queueData);
        });
      });
    });

    if (this.amqp.channelCounter >= self.MAX_CHANNEL_PER_CONNECTION && !self.creatingAmqpConnection) {
      self._createAmqpConnection();
    }
  },

  /**
   * queueUnsubscribe: unsubscribes from the queues
   *
   */
  queuesUnsubscribe: function (socket) {
    var self = this;
    socket.get('queueData', function (err, queueData) {
      if (queueData) {
        queueData.forEach(function (item) {
          // node-amqp behaviour in case of a proxy restart (a proxy between clients, smart-router and RabbitMQ):
          // - All Clients are disconnected, so we trigger many unsubscriptions
          // - 1 by 1, node-amqp put the tasks in its tasksQueue and run them
          // - At some point, node-amqp is aware of the disconnection
          // - The already run tasks are lost. Those still in the queue or those queued after will be run at reconnection.
          // So we only need to monitor the unsubscriptions which are triggered while the queue is open, they are the
          // ones that can be lost.
          logger.debug(util.format('Unsubscribing from queue %s (%s)', item.queue.name, item.queue.state));
          if (item.queue.state == 'open') {
            self._consumersWaitingForUnsubscription.push(item);
          }
          item.queue.unsubscribe(item.ctag).addCallback(function () {
            logger.info(util.format('Unsubscribed from Queue [%s] for socket %s ; consumerTag=%s', item.queue.name, socket.id, item.ctag));
            for (var i = 0; i < self._consumersWaitingForUnsubscription.length; ++i) {
              if (self._consumersWaitingForUnsubscription[i] && self._consumersWaitingForUnsubscription[i].ctag == item.ctag) {
                self._consumersWaitingForUnsubscription.splice(i, 1);
                break;
              }
            }
          });
        });
      }
    });
  },

  /**
   * check: performs some checks on the message received.
   *
   */
  check: function (socket, type, message, callback) {
    var self = this;
    socket.get('actorid', function (err, id) {
      if (!id) {
        var data = {};
        data.type = type;
        data.message = message;
        var warnMsg = util.format("An unidentified actor tried to post the following message on Socket %s : Type='%s' Message=%s",
                                  socket.id, type, JSON.stringify(message));
        self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.WARNING, EVENTS_CONTROLLER_SUBSYSTEM, warnMsg));
        logger.warn(warnMsg);
        socket.emit('whoareyou', data);
        return callback(err, false);
      }
      // here we can add additional checks.
      if (!message.ids) {
        var error = util.format("Received an ill-formed message, missing ids. (%s)", JSON.stringify(message));
        self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, EVENTS_CONTROLLER_SUBSYSTEM, error));
        socket.emit('error', error);
        return callback(error);
      }
      return callback(err, !!id);
    });
  },

  /**
   * publish: hides the complexity of publishing to the different queues
   *
   */
  publish: function (destactorid, type, message, socket) {
    var self = this;
    var qmsg = {};
    qmsg.type = type;
    qmsg.message = message;
    logger.debug(util.format("Publishing '%s' on Queue [%s]", type, destactorid));
    // First, we declare the Queue using passive arg, in order to perform checks (Queue exists + has consumers)
    this.amqp.queue(destactorid, { passive : true }, function(queue) {
    })
    .once('error', function(err) {
      var errMsg = util.format("The queue [%s] does not exist (%s). The following message (type='%s') *is LOST*: %s",
                                destactorid, err, type, JSON.stringify(message));
      logger.error(errMsg);
      self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, EVENTS_CONTROLLER_SUBSYSTEM, errMsg));
      if (socket) // Prevent new config deployment issues
      {
        socket.emit('error', util.format('Sorry, your message could not be delivered. Error=The queue [%s] does not exist.',
                                         destactorid));
      }
    })
    .once('open', function(queueName, messageCount, consumerCount) {
      // If the queue exists, we publish (publishing on a non existing queue will lose the message anyway)
      if (consumerCount < 1)
      {
        var warnMsg = util.format('Queue [%s] does not have any consumers. (Pending message(s) before publishing: %d)', queueName, messageCount);
        logger.warn(warnMsg);
        self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.WARNING, EVENTS_CONTROLLER_SUBSYSTEM, warnMsg));
      }
      else
      {
        logger.trace(util.format('Before publishing, Queue [%s] had %d consumer(s) and %d message(s) pending.', queueName, consumerCount, messageCount));
      }
      self.amqp.publish(destactorid, qmsg, { contentType: 'application/json' });
    });

    if (this.amqp.channelCounter >= self.MAX_CHANNEL_PER_CONNECTION && !self.creatingAmqpConnection) {
      self._createAmqpConnection();
    }
  },

  _createAmqpConnection: function() {
    var self = this;
    self.creatingAmqpConnection = true;

    logger.info(util.format('Opening connection to RabbitMQ at %s.', self.config.amqp.url));
    var amqp = Amqp.createConnection(self.config.amqp, { reconnect: true, reconnectBackoffTime: self.reconnectDelay });

    amqp.on('error', function (err) {
      self.amqpError = true;
      var errMsg = util.format('Error while connecting to RabbitMQ: %s. Will try to reconnect in %s', err, self.reconnectDelay);
      logger.error(errMsg);
      self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, EVENTS_CONTROLLER_SUBSYSTEM, errMsg));
      //Emit an error on the socket for the client.
      self.emit('amqpError', new Error(errMsg));
    });
    amqp.once('ready', function() {
      self.amqp = amqp;
      self.creatingAmqpConnection = false;
    });
    amqp.on('ready', function() {
      logger.info(util.format('Connected to RabbitMQ at %s', self.config.amqp.url));
      if (self.started && self.amqpError) { // Retry the unsubscription only once even if there are several connections
        // If we were trying to do some unsubscriptions before the error occurred, do them now.
        setTimeout(function () {
          self._consumersWaitingForUnsubscription.forEach(function(item) {
            logger.info('Reconnection: Retrying to Unsubscribe from queue ' + item.queue.name + ' for consumer=' + item.ctag);
            item.queue.unsubscribe(item.ctag);
          });
        }, 500); // let time to node-amqp to do the unsubscription itself, if the task is queued.
      }
      self.amqpError = false;
    });
    amqp.on('close', function() {
      logger.info('Connection to RabbitMQ closed.');
      // AMQP backoff strategy only works in case an error has occurred.
      // So if amqp has already emitted an error, we don't try to reconnect. It is handled by amqp backoff mechanism.
      // But in case of a HAProxy timeout, we just receive a 'close' event without any error. We don't
      // want to wait for a future error (i.e. a client trying to send a message), because we could lose some data.
      if (!amqp.manuallyClosed && self.started && !self.amqpError)
      {
        logger.info('SmartRouter is still running. Trying to reconnect to RabbitMQ.');
        amqp.reconnect();
      }
    });

    // length - 1: We always keep the last connection since messages can still arrive until the new one is ready
    var i = self.amqpConnections.length - 1;
    if (i >= 0) {
      logger.debug(util.format("Status of connection [%d]: %d existing queues", i, Object.keys(self.amqpConnections[i].queues).length));
    }
    while (--i >= 0) {
      var connection = self.amqpConnections[i];
      var queuesNumber = Object.keys(connection.queues).length;
      logger.debug(util.format("Status of connection [%d]: %d existing queues", i, queuesNumber));
      if (queuesNumber == 0) {
        logger.info("Closing a connection with no more Queues");
        connection.manuallyClosed = true; // Don't try to reconnect
        connection.end();
        self.amqpConnections.splice(i, 1);
      }
    }

    self.amqpConnections.push(amqp);
    logger.debug("New number of active connections: " + self.amqpConnections.length);

    return amqp;
  }
});
