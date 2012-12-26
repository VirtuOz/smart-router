/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */

var CONFIG = require('config');
var QUEUEFLAG = require('../lib/const').QUEUEFLAG;

exports.local = 
{
  port: process.env.PORT || 8080,
  amqp: { url: 'amqp://127.0.0.1' },
  endpoints: [ 
    { name: 'agent', ids: [ 456, 457 ], queue: QUEUEFLAG.actor | QUEUEFLAG.endpoint },
    { name: 'livechat', ids: [ 456 ], queue: QUEUEFLAG.endpoint },
    { name: 'ui', ids: [ 456 ] }
  ],
  routes: [
    { endpoint: '*', messagetype: 'echo', // received on any endpoint
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.default, 'echo', message);
      }
    },
    { endpoint: 'ui', messagetype: 'talk',
      action: function (message, socket, smartrouter) {  
        if (message.ids.livechat && message.metadata.livechat) {
          smartrouter.publish(message.ids.livechat, 'talk', message);
          smartrouter.publish(message.ids.agent, 'log', message);
        } 
        else {
          smartrouter.publish(message.ids.agent, 'talk', message); 
        }
      }
    },
    { endpoint: 'agent', messagetype: 'talkback', // when we receive a 'talkback' message on the 'agent' endpoint (ie. from the agent),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.ui, 'talkback', message); // we publish it to the message.ids.ui queue (ie. to the corresponding ui)
      }
    },
    { endpoint: 'livechat', messagetype: 'talkback', // when we receive a 'talkback' message on the 'livechat' endpoint (ie. from the livechat),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.ui, 'talkback', message); // we publish it to the message.ids.ui queue (ie. to the corresponding ui)
      }
    },
    { endpoint: 'agent', messagetype: 'sessionrequest',
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.livechat, 'sessionrequest', message);
      }
    }

  ]
};
