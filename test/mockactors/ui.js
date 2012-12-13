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
var Actor = require('./../../lib').Actor;

var UI = new JS.Class(Actor, {
  initialize: function (server, endpoint, id, connectionParams) {
    this.callSuper(server, endpoint, id, connectionParams);
    this.agent = 'agent/456';
  },
  
  connect: function () {
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
    this.log('saying ' + text + ' to agent ' + this.agent);
    var msg = { ids: { ui: this.actorid, agent: this.agent }, metadata: {}, payload: { text: text }};
    if (this.livechat) {
      msg.ids.livechat = this.livechat;
      msg.metadata.livechat = true;
    }
    this.socket.emit('talk', msg);
  }
});

module.exports.UI = UI;
