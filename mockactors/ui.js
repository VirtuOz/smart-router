/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-26
 */
require('jsclass');
JS.require('JS.Class');
var Actor = require('./actor');

var UI = new JS.Class(Actor, {
  initialize: function (server, endpoint, id) {
    this.callSuper(server, endpoint, id);
    this.agent = 'agent/456';
  },
  
  setup: function () {
    var self = this;
    var socket = self.callSuper();
    socket.on('talkback', function (data) {
      self.log(data.ids.agent + ' said ' + data.payload.text);
      self.agent = data.ids.agent;
    });
  },
  talk: function (text) {
    this.log('saying ' + text + ' to ' + this.agent);
    this.socket.emit('talk', { ids: { ui: this.actorid, agent: this.agent }, metadata: {}, payload: { text: text }});
  }
});

var ui = new UI('localhost:8080', 'ui/456', '10.50.61.103');
ui.setup();

setTimeout(function () {  
  ui.talk('hello world!');
}, 1000);

setTimeout(function () {
  ui.talk('hello goodbye!');
}, 3000);

/*setInterval(function () { 
  ui.log('quack');
  ui.echo(); 
  }, 5000);
  */
