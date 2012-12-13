/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-29
 */
 
require('jsclass');
JS.require('JS.Class');
var Actor = require('./../../lib').Actor;

var LiveChat = new JS.Class(Actor, {
  initialize: function (server, endpoint, id, connectionParams) {
    this.callSuper(server, endpoint, id, connectionParams);
  },
  connect: function () {
    var self = this;
    this.callSuper(this.localsetup);
    self.socket.on('talk', function (data) {
      self.log(data.ids.ui + ' said ' + data.payload.text);
      self.UI = data.ids.ui;
      self.talk('hello from human');
    });
    self.socket.on('sessionrequest', function (data) {
      self.agent = data.ids.agent;
      self.UI = data.ids.ui;
      self.log('livechat session requested from ' + data.ids.agent + ' for ' + data.ids.ui);
      self.talk('you are connected to livechat');
    });
  },
  talk: function (text) {
    this.log('saying ' + text);
    this.socket.emit('talkback', { ids: { ui: this.UI, agent: this.agent, livechat: this.endpoint }, metadata: { livechat: true }, payload: { text: text }});
  }
});

module.exports.LiveChat = LiveChat;
