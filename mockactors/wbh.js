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
    this.UI = 'agent/456';
  },
  setup: function () {
    this.callSuper(this.localsetup);
  },
  localsetup: function (self) {
    self.log('registering talk');
    self.socket.on('talk', function (data) {
      self.log(data.ids.ui + ' said ' + data.payload.text);
      self.UI = data.ids.ui;
      self.talk('hello again');
    });
  },
  talk: function (text) {
    this.log('saying ' + text);
    this.socket.emit('talkback', { ids: { ui: this.UI, agent: this.actorid }, metadata: {}, payload: { text: text }});
  }
});

var wbh = new Agent('localhost:8080', 'agent/456', '10.50.61.103');
wbh.setup();
/*
setInterval(function () { 
  wbh.echo(); 
  }, 30000);
  

var wbh2 = new Agent('127.0.0.1:8080', 'agent/456', '10.50.61.104');
wbh2.setup();

setInterval(function () { 
  wbh2.echo(); 
  }, 40000);
*/
