/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-12-13
 */

require('jsclass');
JS.require('JS.Class');
var logger = require('../util/logger');
var Actor = require('../lib').Actor;
var SmartRouter = require('../lib').SmartRouter;
var QUEUEFLAG = require('../lib').const.QUEUEFLAG;

var BasicActor = new JS.Class(Actor, {
  initialize: function() {
    this.callSuper();
    this.responses = 0;
  },

  connect: function () {
    var self = this;
    this.callSuper();
    self.socket.on('message', function (data) {
      if (self.responses === 2) // Enough messages
      {
        self.log('Stopping the test.');
        self.socket.disconnect();
        return;
      }
      ++self.responses;
      self.log(data.ids.writer + ' said ' + data.payload.text);
      self.message('hello from actor1', data.ids.writer);
    });
  },
  message: function (text, addressee) {
    this.log('saying ' + text + ' to ' + addressee);
    this.socket.emit('message',
                     {
                       ids: {
                         writer: this.actorid,
                         addressee: addressee
                       },
                       metadata: {},
                       payload: { text: text }
                     });
  }
});

var basicconfig = {
  port: process.env.PORT || 8080,
  amqp: { url: 'amqp://127.0.0.1' },
  endpoints: [
    { name: 'actor', sub: [ 1, 2 ], queue: QUEUEFLAG.actor | QUEUEFLAG.endpoint } // smart-router will create 2 queue:
                                                                                 // a generic 'actor/<id>' and a specific '[actorid]'
  ],
  routes: [
    { endpoint: '*', messagetype: 'echo', // received on any endpoint
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.default, 'echo', message);
      }
    },
    { endpoint: 'actor', messagetype: 'message', // when we receive a 'message' message on the 'actor1' endpoint (ie. from the actor1),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.addressee, 'message', message); // we publish it to the message.ids.addressee queue (ie. to actor2)
      }
    }
  ]
};

var smartrouter = new SmartRouter();
smartrouter.on('started', function () {
  console.log('SmartRouter started');

  var actor1 = new BasicActor('localhost:8080', 'actor/1', 'my_actor_id1');
  var actor2 = new BasicActor('localhost:8080', 'actor/2', 'actor_id2');
  actor1.connect();
  actor2.connect();

  setTimeout(function () {
    actor1.message('"Hello to global endpoint actor/2"', 'actor/2');
  }, 1000);

});

smartrouter.start(basicconfig);

