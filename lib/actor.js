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
    this.socket = io.connect('http://' + server + '/' + endpoint, connectionParams);
    this.server = server;
    this.actorid = endpoint + '/' + id;
    this.endpoint = endpoint;
  },
  setup: function () {
    var self = this;
    self.socket.once('connect', function () {
      self.log('connected');
      self.socket.on('hello', function () {
        self.log('handshaked');
      });
      self.socket.on('whoareyou', function (data) {
        self.log('got whoareyou');
        self.socket.emit('iam', self.actorid);
        if (data) {
          self.socket.emit(data.type, data.message);
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
