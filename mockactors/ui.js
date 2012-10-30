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
      var from = (!!data.metadata.livechat) ? data.ids.livechat : data.ids.agent;
      self.livechat = data.ids.livechat;
      self.log(from + ' said ' + data.payload.text);
      self.agent = data.ids.agent;
    });
  },
  talk: function (text) {
    this.log('saying ' + text);
    var msg = { ids: { ui: this.actorid, agent: this.agent }, metadata: {}, payload: { text: text }};
    if (this.livechat) {
      msg.ids.livechat = this.livechat;
      msg.metadata.livechat = true;
    }
    this.socket.emit('talk', msg);
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

setTimeout(function () {
  ui.talk('livechat');
}, 7000);

setTimeout(function () {
  ui.talk('woohoo');
}, 10000);

/*setInterval(function () { 
  ui.log('quack');
  ui.echo(); 
  }, 5000);
  */
