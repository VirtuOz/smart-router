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

var SmartRouter = new JS.Class(EventEmitter, {
  initialize: function () {
    EventEmitter.call(this);
    this.io = {};
    this.amqp = {};
    this.config = {};
  },

  /**
   * start method: starts the SmartRouter 
   * 
   */
  start: function (config) {
    console.log('starting...');
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
        var socket = self.io.of('/' + endpoint.name);
        self.registerRoutes(endpoint.name, '', socket);
      } else {
        endpoint.ids.forEach(function (id) {
          var socketendpoint = self.io.of('/' + endpoint.name + '/' + id);
          self.registerRoutes(endpoint.name, id, socketendpoint);
        });
      }    
    });
  },
  
  /**
   * registerRoutes
   */
  registerRoutes: function (name, id, socketep) {
    var self = this;
    socketep.on('connection', function (socket) {
      socket.emit('whoareyou');
      socket.on('iam', function (actorid) {
        console.log('call from ' + actorid);
        socket.set('actorid', actorid, function () {
          console.log('hello actor ' + actorid);
          socket.emit('hello');
        });
        self.amqp.queue(actorid, function (q) {
          q.bind(name + id, actorid);
          q.subscribe(function (message, headers, deliveryInfo) {
            socket.emit(message.data.type, message.data);
          });
        });
      });
      self.config.routes.forEach( function (route) {
        if (route.name === name) {
          socket.on(route.message, function (data) {
            if (self.check(socket, route.message, data)) {
              route.action(data, self);
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
  }
});

exports.instance = new SmartRouter();
