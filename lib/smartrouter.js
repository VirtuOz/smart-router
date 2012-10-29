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
    console.log('starting SmartRouter...');
    this.config = config;
    this.io = Io.listen(config.port);
    this.amqp = Amqp.createConnection(config.amqp);
    this.amqp.on('error', function (err) {
      console.log('error connecting to RabbitMQ: ' + err);
    });
    
    this.registerEndpoints();
    
    this.emit('started');
  },
   
  /**
   * registerEndpoints: register bindings for the endpoints.
   * 
   */
  registerEndpoints: function () {
    var self = this;
    self.config.endpoints.forEach(function (endpoint) {
      console.log('registering endpoint ' + endpoint.name);
      if (endpoint.ids.length === 0) {
        var socketendpoint = self.io.of('/' + endpoint.name);
        self.registerRoutes(endpoint.name, '', endpoint.queue, socketendpoint);
      } else {
        endpoint.ids.forEach(function (id) {
          var socketendpoint = self.io.of('/' + endpoint.name + '/' + id);
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
          console.log('hello actor ' + actorid);
          socket.emit('hello');
        });
        var exchangename = endpointname + '/' + endpointid;
        self.amqp.exchange(exchangename, { type: 'direct', durable: true, autoDelete: false });
        if (!queuebehaviour|| (queuebehaviour & QUEUEFLAG.actor > 0)) {
          self.amqp.queue(actorid, { autoDelete: false }, function (q) {
            q.bind(exchangename, actorid);
            q.subscribe(function (message, headers, deliveryInfo) {
              console.log('emiting ' + message.type + ' to ' + actorid);
              socket.emit(message.type, message.message);
            });
          });
        }
        if (queuebehaviour & QUEUEFLAG.endpoint > 0) {
          self.amqp.queue(exchangename, { autoDelete: false }, function (q) {
            q.bind(exchangename, exchangename);
            q.subscribe(function (message, headers, deliveryInfo) {
              console.log('emiting ' + message.type + ' to ' + exchangename);
              socket.emit(message.type, message.message);
            });
          });
        }
      });
      self.config.routes.forEach( function (route) {
        if (route.endpoint === '*' || route.endpoint === endpointname) {
          console.log('registering ' + route.messagetype + ' for ' + route.endpoint);
          socket.on(route.messagetype, function (message) {
            if (self.check(socket, route.messagetype, message)) {
              console.log('routing ' + route.messagetype + ' from  ' + endpointname);
              route.action(message, socket, self);
            }
          });
        }
      });
    });
  },
  
  /**
   * check: performs some checks on the message received.
   * 
   */
  check: function (socket, type, message) {
    var actorid;
    socket.get('actorid', function (err, id) {
      if (err) {
        actorid = undefined;
        return;
      } else {
        actorid = id;
        return;
      }
    });
    if (!actorid) {
      var data = {};
      data.type = type;
      data.message = message;
      socket.emit('whoareyou', data); 
      return false;
    }
    return true;
  },
  
  /**
   * publish: hides the complexity of publishing to the different queues
   * 
   */
  publish: function (endpoint, destactorid, type, message) {
    var qmsg = {};
    qmsg.type = type;
    qmsg.message = message;
    this.amqp.exchange(endpoint, { passive: true}).publish(destactorid, qmsg, { contentType: 'application/json' });
  }
});

exports.instance = new SmartRouter();
