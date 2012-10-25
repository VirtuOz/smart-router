exports.local = 
{
  port: 8080,
  amqp: { url: 'amqp://'},
  endpoints: [ 
    { name: 'agent', ids: [ 456 ] },
    { name: 'ui', ids: [ 456 ] }
  ],
  routes: [
	{ endpoint: 'agent', message: 'talk',
	  action: function (data, smartrouter) {}
    }
  ]
}

exports.another = {
	
}
