/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-25
 */
 
require('jsclass');
JS.require('JS.Class');
var Actor = require('./actor');

var Agent = new JS.Class(Actor, {
  initialize: function (server, endpoint, id) {
    this.callSuper(server, endpoint, id);
    this.UI = 'ui/456';
    this.livechat = 'livechat/456';
  },
  setup: function () {
    var self = this;
    this.callSuper();
    self.socket.on('talk', function (data) {
      self.UI = data.ids.ui;
      self.log(data.ids.ui + ' said ' + data.payload.text);
      if (data.payload.text === 'livechat') {
        var msg = { ids: { ui: self.UI, agent: self.actorid, livechat: self.livechat }, metadata: { livechat: false }, 
          payload: { text: 'transferring to livechat' }};
        self.socket.emit('talkback', msg);
        msg.payload.text = 'requesting session';
        self.socket.emit('sessionrequest', msg);
      } else {
        self.talk('hello again');
      }
    });
    self.socket.on('log', function (data) {
      console.log('logging ' + JSON.stringify(data));
    });
  },
  talk: function (text) {
    this.log('saying ' + text);
    this.socket.emit('talkback', { ids: { ui: this.UI, agent: this.actorid }, metadata: {}, payload: { text: text }});
  }
});

var wbh = new Agent('localhost:8080', 'agent/456', '10.50.61.103');
wbh.setup();

setInterval(function () { 
  wbh.echo(); 
  }, 30000);
  

var wbh2 = new Agent('127.0.0.1:8080', 'agent/456', '10.50.61.104');
wbh2.setup();

setInterval(function () { 
  wbh2.echo(); 
  }, 40000);

