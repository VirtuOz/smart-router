/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */

var QUEUEFLAG = require('../lib/const').QUEUEFLAG;

exports.local = 
{
  port: 8080,
  amqp: { url: 'amqp://10.50.61.102'},
  endpoints: [ 
    { name: 'agent', ids: [ 456 ], queue: QUEUEFLAG.actor | QUEUEFLAG.endpoint },
    { name: 'ui', ids: [ 456 ] }
  ],
  routes: [
    { endpoint: '*', messagetype: 'echo',
      action: function (message, socket, smartrouter) {
        smartrouter.publish(socket.name, message.ids.default, 'echo', message);
      }
    },
    { endpoint: 'ui', messagetype: 'talk',
      action: function (message, socket, smartrouter) {
        smartrouter.publish(socket.name, message.ids.agent, 'talk', message);
      }
    },
    { endpoint: 'agent', messagetype: 'talkback',
      action: function (message, socket, smartrouter) {
        smartrouter.publish(socket.name, message.ids.ui, 'talkback', message);
      }
    }

  ]
}

exports.another = {
	
}
