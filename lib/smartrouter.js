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

module.exports = new JS.Class(EventEmitter, {
  initialize: function () {
    EventEmitter.call(this);
    this.io = {};
    this.amqp = {};
    this.config = {};
  },

  /**
   * start: starts the SmartRouter 
   * 
   */
  start: function (config) {
    logger.info('Starting SmartRouter... Will listen on port ' + config.port);
    logger.info('Using https: ' + CONFIG.https.use);
    logger.info('RabbitMQ url is set to ' + config.amqp.url);
    var self = this;
    self.config = config;
    self.amqp = Amqp.createConnection(config.amqp);
    self.amqp.on('error', function (err) {
      var reconnect_delay = CONFIG.rabbitmq_reconnect_delay || 10000;
      logger.error('Error while connecting to RabbitMQ: ' + err +
                   '. Will try to reconnect in ' + reconnect_delay + 'ms.');
      setTimeout(function() {
        self.amqp.reconnect();
      }, reconnect_delay);
    });
    self.amqp.on('ready', function() {
      if (CONFIG.https.use) {
        var options = {
          pfx: fs.readFileSync(CONFIG.https.pfx_path),
          passphrase: CONFIG.https.pfx_passphrase
        };
        self.io = Io.listen(https.createServer(options).listen(config.port));
      }
      else {
        self.io = Io.listen(config.port);
      }
      self._configureIo();
      self.registerEndpoints();
      self.listenForNewEndpoints();
      self.emit('started');
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
      self.emit('stopped');
    });
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
        logger.info('Request received to register new Endpoint: ' + JSON.stringify(newEndpoint));
        self.config.endpoints.forEach(function (endpoint) {
          if (endpoint.name === newEndpoint.name) {
            endpointFound = true;
            if (endpoint.sub.indexOf(newEndpoint.id) < 0) {
              var socketendpoint = self.io.of('/' + newEndpoint.name + '/' + newEndpoint.id);
              logger.info('Endpoint registered on [' + '/' + newEndpoint.name + '/' + newEndpoint.id + ']');
              self.registerRoutes(newEndpoint.name, newEndpoint.id, endpoint.queue, socketendpoint);

              endpoint.sub.push(newEndpoint.id); // Adding the new ID to the existing configuration.
              logger.info('Current config is now: ' + JSON.stringify(self.config));
              socket.emit('endpointRegistered', {});
            }
            else {
              // Endpoint already exists
              logger.warn('Endpoint [/' + newEndpoint.name + '/' + newEndpoint.id + '] already exists. Aborted.');
            }
          }
        });
        if (!endpointFound) {
          logger.error('[' + newEndpoint.name + '] is not a valid Endpoint.');
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
      logger.info('Registering endpoint ' + endpoint.name);
      endpoint.sub = endpoint.sub || endpoint.ids; // backward compatibility....
      if (endpoint.sub.length === 0) {
        var socketendpoint = self.io.of('/' + endpoint.name);
        logger.info('Endpoint registered on [' + '/' + endpoint.name + ']');
        self.registerRoutes(endpoint.name, '', endpoint.queue, socketendpoint);
      } else {
        endpoint.sub.forEach(function (sub) {
          var socketendpoint = self.io.of('/' + endpoint.name + '/' + sub);
          logger.info('Endpoint registered on [' + '/' + endpoint.name + '/' + sub + ']');
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
      logger.info('Connection received on /' + endpointname + '/' + endpointid);
      socket.emit('whoareyou', {});
      socket.on('iam', function (actorid) {
        socket.set('actorid', actorid, function () {
          logger.info('Registered actor [' + actorid + ']. Handshaking.');
          socket.emit('hello', {});
        });
        var exchangename = endpointname + '/' + endpointid;
        self.amqp.exchange(exchangename, { type: 'direct', durable: true, autoDelete: false });
        if (!queuebehaviour || ((queuebehaviour & QUEUEFLAG.actor) > 0)) {
          self.queueSubscribe(exchangename, actorid, socket);
        }
        if ((queuebehaviour & QUEUEFLAG.endpoint) > 0) {
          self.queueSubscribe(exchangename, exchangename, socket);
        }
      });
      socket.on('disconnect', function () {
        self.queuesUnsubscribe(socket);
      });
      self.config.routes.forEach( function (route) {
        if (route.endpoint === '*' || route.endpoint === endpointname) {
          logger.info('Registering route [' + route.messagetype + '] for endpoint [' + route.endpoint + ']');
          socket.on(route.messagetype, function (message) {
            self.check(socket, route.messagetype, message, function (err, checked) {
              if (err) {
                logger.error(err);
              }
              if (checked) {
                logger.debug('Routing \'' + route.messagetype + '\' from [' + endpointname + ']. Message=' +
                             JSON.stringify(message));
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
  queueSubscribe: function (exchangename, queuename, socket) {
    logger.info('Subscribing to queue. ExchangeName=' + exchangename + '; QueueName=' +
                 queuename + '; Socket='+socket.id);
    var self = this;
    self.amqp.queue(queuename, { autoDelete: false }, function (q) {
      q.bind(exchangename, queuename);
      q.subscribe(function (message, headers, deliveryInfo) {
        logger.debug('Emiting \'' + message.type + '\' from queue [' + queuename + '] on socket ' + socket.id);
        socket.emit(message.type, message.message);
      })
      .addCallback(function (ok) {
        var data = { queue: q, ctag: ok.consumerTag };
        logger.trace('Registering consumerTag [' + ok.consumerTag + '] for queue [' + queuename + '] in socket ' + socket.id);
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
            logger.info('Unsubscribed from Queue [' + item.queue.name + '] with ' + item.ctag + ' for socket ' + socket.id);
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
    socket.get('actorid', function (err, id) {
      if (!id) {
        var data = {};
        data.type = type;
        data.message = message;
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
  publish: function (destactorid, type, message) {
    var qmsg = {};
    qmsg.type = type;
    qmsg.message = message;
    logger.trace('Publishing \'' + type + '\' on Queue [' + destactorid + ']');
    this.amqp.publish(destactorid, qmsg, { contentType: 'application/json' });
  }
});
