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

var io = require('socket.io-client');

var logger = require('../util/logger');
 
module.exports = new JS.Class({
  initialize: function (server, endpoint, id, connectionParams) {
    this.server = server;
    this.actorid = endpoint + '/' + id;
    this.endpoint = endpoint;
    this.connectionParams = connectionParams || {};
  },
  connect: function () {
    var self = this;
    self.log('Connecting to ' + self.server + '/' + self.endpoint);
    self.socket = io.connect(self.server + '/' + self.endpoint, self.connectionParams);

    self.socket.once('connect', function () {
      self.log('connected');
      self.socket.on('hello', function () {
        self.log('handshaked');
      });
      self.socket.on('whoareyou', function (data) {
        self.log('SmartRouter is asking for our identity. Replying...');
        self.socket.emit('iam', self.actorid);
        if (data) { // data contains a previous message that was rejected because the smart router did not know who we were
          self.socket.emit(data.type, data.message); // we resend it.
        }
      });
      self.socket.on('echo', function (data) {
        self.log('got echo: ' + JSON.stringify(data));
      });
    });
    self.socket.on('connecting', function (transportName) {
      self.log('Trying to connect using ' + transportName);
    });
    self.socket.on('connect_failed', function () {
      self.error('Connection failed.');
    });
    self.socket.on('error', function (err) {
      self.error(err);
    });
    self.socket.on('disconnect', function (err) {
      self.log('Disconnected: ' + err);
    });
    self.socket.on('reconnecting', function (reconnectionDelay, reconnectionAttempts) {
      self.log('Attempt to reconnect ' + reconnectionAttempts + '. Will retry in ' + reconnectionDelay + 'ms');
    });
    self.socket.on('reconnect', function (msg) {
      self.log('Reconnected to ' + msg);
    });
    self.socket.on('reconnect_failed', function () {
      self.error('Attempt(s) to reconnect failed.');
    });
    return self.socket;
  },
  log: function (msg) {
    logger.info('[' + this.actorid + ']: ' + msg);
  },
  error: function (msg) {
    logger.error('[' + this.actorid + ']: ' + msg);
  },
  echo: function () {
    this.socket.emit('echo', { ids: { default: this.actorid}, metadata: {}, payload: 'quack!!' });
  }
});
