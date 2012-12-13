/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

require('jsclass');
JS.require('JS.Class');
var logger = require('../../util/logger');
var Actor = require('./../../lib').Actor;

var BasicActor = new JS.Class(Actor, {
  initialize: function() {
    this.callSuper();
    this.responses = 0;
  },

  connect: function () {
    var self = this;
    this.callSuper();
    self.socket.on('talk', function (data) {
      if (self.responses === 2) // Enough talking
      {
        self.log('Stopping the test.');
        self.socket.disconnect();
        return;
      }
      ++self.responses;
      self.log(data.ids.writer + ' said ' + data.payload.text);
      self.talk('hello from actor1', data.ids.writer);
    });
  },
  talk: function (text, addressee) {
    this.log('saying ' + text + ' to ' + addressee);
    this.socket.emit('talk',
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

module.exports.BasicActor = BasicActor;
