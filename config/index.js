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
  port: process.env.PORT || CONFIG.io.port || 3000,
  amqp: { url: CONFIG.amqp.url },
  endpoints: [ 
    { name: CONFIG.endpoints.agent.name, ids: [ CONFIG.endpoints.agent.id, 457 ], queue: QUEUEFLAG.actor | QUEUEFLAG.endpoint },
    { name: CONFIG.endpoints.livechat.name, ids: [ CONFIG.endpoints.livechat.id ], queue: QUEUEFLAG.endpoint },
    { name: CONFIG.endpoints.ui.name, ids: [ CONFIG.endpoints.ui.id ] }
  ],
  routes: [
    { endpoint: '*', messagetype: 'echo', // received on any endpoint
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.default, 'echo', message);
      }
    },
    { endpoint: CONFIG.endpoints.ui.name, messagetype: 'talk',
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
    { endpoint: CONFIG.endpoints.agent.name, messagetype: 'talkback', // when we receive a 'talkback' message on the 'agent' endpoint (ie. from the agent),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.ui, 'talkback', message); // we publish it to the message.ids.ui queue (ie. to the corresponding ui)
      }
    },
    { endpoint: CONFIG.endpoints.livechat.name, messagetype: 'talkback', // when we receive a 'talkback' message on the 'agent' endpoint (ie. from the agent),
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.ui, 'talkback', message); // we publish it to the message.ids.ui queue (ie. to the corresponding ui)
      }
    },
    { endpoint: CONFIG.endpoints.agent.name, messagetype: 'sessionrequest',
      action: function (message, socket, smartrouter) {
        smartrouter.publish(message.ids.livechat, 'sessionrequest', message);
      }
    }

  ]
}

exports.another = {
	
}
