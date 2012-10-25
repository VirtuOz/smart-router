exports.local = 
{
  port: 8080,
  amqp: { url: 'amqp://10.50.61.102'},
  endpoints: [ 
    { name: 'agent', ids: [ 456 ] },
    { name: 'ui', ids: [ 456 ] }
  ],
  routes: [
    { endpoint: 'agent', messagetype: 'echo',
      action: function (message, socket, smartrouter) {
        var qmsg = {};
        qmsg.type = 'echo';
        qmsg.data = message;
        smartrouter.amqp.exchange(socket.name, { passive: true}).publish(message.from, qmsg, { contentType: 'application/json' });
      }
    }
  ]
}

exports.another = {
	
}
