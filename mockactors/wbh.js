/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-25
 */
 
var io = require('socket.io-client').connect('http://localhost:8080/agent/456');

io.on('connect', function () {
	console.log('connected');
  io.on('hello', function (data) {
    console.log('handshaked ' + data);
  });
  io.on('whoareyou', function (data) {
    console.log('got whoareyou ' + data);
    io.emit('iam', 'agent456-10.50.61.103');
    if (data) {
      io.emit(data.type, data.message);
    }
  });
});
io.on('connection_failed', function (err) {
  console.log('connection failed '+ err);
});
io.on('error', function (err) {
  console.log('error '+ err);
});

setInterval(function () { io.emit('iam', 'agent456-10.50.61.103'); }, 1000);
