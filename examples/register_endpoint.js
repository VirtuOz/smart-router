/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var io = require('socket.io-client');

var socket = io.connect('http://localhost:8080/');
socket.once('connect', function() {
  socket.emit('registerNewEndpointId', { name: 'agent', id: 458 });
  socket.disconnect();
});
