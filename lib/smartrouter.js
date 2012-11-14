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
var Io = require('socket.io');
var Amqp = require('amqp');
var CONFIG = require('config');
var logger = require('../util/logger');
var QUEUEFLAG = require('./const').QUEUEFLAG;

var SmartRouter = new JS.Class(EventEmitter, {
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
    logger.info('RabbitMQ url is set to ' + config.amqp.url);
    var self = this;
    self.config = config;
    self.amqp = Amqp.createConnection(config.amqp);
    self.amqp.on('error', function (err) {
      logger.error('error connecting to RabbitMQ: ' + err);
    });
    self.amqp.on('ready', function() {
      self.io = Io.listen(config.port);
      self._configureIo();
      self.registerEndpoints();
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
   * registerEndpoints: register bindings for the endpoints.
   * 
   */
  registerEndpoints: function () {
    var self = this;
    self.config.endpoints.forEach(function (endpoint) {
      logger.info('registering endpoint ' + endpoint.name);
      if (endpoint.ids.length === 0) {
        var socketendpoint = self.io.of('/' + endpoint.name);
        logger.info('Endpoint registered on [' + '/' + endpoint.name + ']. Registering routes for it...');
        self.registerRoutes(endpoint.name, '', endpoint.queue, socketendpoint);
      } else {
        endpoint.ids.forEach(function (id) {
          var socketendpoint = self.io.of('/' + endpoint.name + '/' + id);
          logger.info('Endpoint registered on [' + '/' + endpoint.name + '/' + id + ']. Registering routes for it...');
          self.registerRoutes(endpoint.name, id, endpoint.queue, socketendpoint);
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
      socket.emit('whoareyou');
      socket.on('iam', function (actorid) {
        socket.set('actorid', actorid, function () {
          logger.info('Registered actor [' + actorid + ']. Handshaking.');
          socket.emit('hello');
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
          logger.info('registering route [' + route.messagetype + '] for endpoint [' + route.endpoint + ']');
          socket.on(route.messagetype, function (message) {
            self.check(socket, route.messagetype, message, function (err, checked) {
              if (err) {
                logger.error(err);
              }
              if (checked) {
                logger.info('routing ' + route.messagetype + ' from  ' + endpointname);
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
    logger.debug('Subscribing to queue. ExchangeName=' + exchangename + '; QueueName=' +
                 queuename + '; Socket='+socket.id);
    var self = this;
    self.amqp.queue(queuename, { autoDelete: false }, function (q) {
      q.bind(exchangename, queuename);
      q.subscribe(function (message, headers, deliveryInfo) {
        logger.debug('emiting ' + message.type + ' to ' + queuename + ' on ' + socket.id);
        socket.emit(message.type, message.message);
      })
      .addCallback(function (ok) {
        var data = { queue: q, ctag: ok.consumerTag };
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
            logger.info('unsubscribed ' + item.queue.name + ' with ' + item.ctag + ' for ' + socket.id);
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
    logger.info('publishing on ' + destactorid);
    this.amqp.publish(destactorid, qmsg, { contentType: 'application/json' });
  }
});

exports.instance = new SmartRouter();
