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
    /**
    * Holds the Nagios responses we return for the next check.  Is replaced after each Nagios check.
    */
    this._nagiosEvents= [];
  },

  /**
   * start: starts the SmartRouter
   *
   */
  start: function (config) {
    logger.info(util.format('Starting SmartRouter... Will listen on port %s', config.port));
    logger.info(util.format('Using https: %s', CONFIG.https.use));
    logger.info(util.format('RabbitMQ url is set to %s', config.amqp.url));
    var self = this;
    self.config = config;

    var reconnect_delay = CONFIG.rabbitmq_reconnect_delay || 10000;
    self.amqp = Amqp.createConnection(config.amqp, { reconnect: true, reconnectBackoffTime: reconnect_delay });

    self.amqp.on('error', function (err) {
      var errMsg = util.format('Error while connecting to RabbitMQ: %s. Will try to reconnect in %s', err, reconnect_delay);
      logger.error(errMsg);
      self._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, EVENTS_CONTROLLER_SUBSYSTEM, errMsg));
      //Emit an error on the socket for the client.
      self.emit('amqpError', new Error(errMsg));
    });
    self.amqp.on('ready', function() {
      if (self.started) {
        logger.info(util.format('Reconnected to RabbitMQ at %s', config.amqp.url));
        return; // We already started the socket.io server, returning.
      }

      logger.info(util.format('Connected to RabbitMQ at %s. Starting Socket.IO server...', config.amqp.url));
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
    self.amqp.on('close', function() {
      logger.info('Connection to RabbitMQ closed.');
    });
  },

  stop: function()
  {
    logger.info('Stopping smartrouter');
    var self = this;
    self.io.server.close();
    self.io.server.once('close', function () {
      logger.debug('socket server closed');
      self.amqp.end();
    });
    self.amqp.once('close', function () {
      self.started = false;
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
    self.amqp.queue(queuename, { autoDelete: false, closeChannelOnUnsubscribe: true }, function (q) {
      q.bind(queuename);
      q.subscribe(function (message, headers, deliveryInfo) {
        logger.debug(util.format("Emiting '%s' from queue [%s] on socket %s", message.type, queuename, socket.id));
        socket.emit(message.type, message.message);
      })
      .addCallback(function (ok) {
        var data = { queue: q, ctag: ok.consumerTag };
        logger.trace(util.format('Registering consumerTag [%s] for queue [%s] in socket %s', ok.consumerTag, queuename, socket.id));
        socket.get('queueData', function (err, queueData) {
          queueData = queueData || [];
          queueData.push(data);
          socket.set('queueData',queueData);
        });
      });
    });
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
          item.queue.unsubscribe(item.ctag).addCallback(function () {
            logger.info(util.format('Unsubscribed from Queue [%s] for socket %s ; consumerTag=%s', item.queue.name, socket.id, item.ctag));
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
    this.amqp.queue(destactorid, { passive : true}, function(queue) {
    })
    .on('error', function(err) {
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
    .on('open', function(queueName, messageCount, consumerCount) {
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
  }
});
