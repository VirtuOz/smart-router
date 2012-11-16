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

exports.basic = {
  port: process.env.PORT || 8080,
  amqp: { url: 'amqp://127.0.0.1' },
  endpoints: [
    { name: 'actor1', ids: [ 33 ], queue: QUEUEFLAG.actor }, // smart-router will create a queue '[actorid]'
    { name: 'actor2', ids: [ 33 ], queue: QUEUEFLAG.actor | QUEUEFLAG.endpoint } // smart-router will create 2 queue:
                                                                                 // a generic 'actor2/33' and a specific '[actorid]'
  ],
  routes: [
    { endpoint: '*', messagetype: 'echo', // received on any endpoint
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.default, 'echo', message);
      }
    },
    { endpoint: 'actor1', messagetype: 'talk', // when we receive a 'talk' message on the 'actor1' endpoint (ie. from the actor1),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.addressee, 'talk', message); // we publish it to the message.ids.actor2 queue (ie. to actor2)
      }
    },
    { endpoint: 'actor2', messagetype: 'talk', // when we receive a 'talk' message on the 'actor2' endpoint (ie. from the actor2),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.addressee, 'talk', message); // we publish it to the message.ids.actor1 queue (ie. to actor1)
      }
    }
  ]
};
