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
          self.queueSubscribe(exchangename, actorid, socket);
        }
        if (queuebehaviour & QUEUEFLAG.endpoint > 0) {
          self.queueSubscribe(exchangename, exchangename, socket);
        }
      });
      socket.on('disconnect', function () {
        self.queuesUnsubscribe(socket);
      });
      self.config.routes.forEach( function (route) {
        if (route.endpoint === '*' || route.endpoint === endpointname) {
          console.log('registering ' + route.messagetype + ' for ' + route.endpoint);
          socket.on(route.messagetype, function (message) {
            self.check(socket, route.messagetype, message, function (err, checked) {
              if (err) {
                console.log(err);
              }
              if (checked) {
                console.log('routing ' + route.messagetype + ' from  ' + endpointname);
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
    var self = this;
    self.amqp.queue(queuename, { autoDelete: false }, function (q) {
      q.bind(exchangename, queuename);
      q.subscribe(function (message, headers, deliveryInfo) {
        console.log('emiting ' + message.type + ' to ' + queuename + ' on ' + socket.id);
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
            console.log('unsubscribed ' + item.name + ' with ' + item.ctag + ' for ' + socket.id);
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
  publish: function (endpoint, destactorid, type, message) {
    var qmsg = {};
    qmsg.type = type;
    qmsg.message = message;
    this.amqp.exchange(endpoint, { passive: true}).publish(destactorid, qmsg, { contentType: 'application/json' });
  }
});

exports.instance = new SmartRouter();
