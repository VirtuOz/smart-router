smart-router
============

As discussed in our Arch session, the Smart Router is a node.js application 
and a RabbitMQ [clustered broker](http://www.rabbitmq.com/clustering.html). 
The different queues will be [mirrored,](http://www.rabbitmq.com/ha.html) 
to ensure HA of the Smart Router as a whole.

The different Actors will connect to the SR the same way using a 
[socket.io](http://socket.io/) type of connection (socket.io extends websocket
 in a sense that that websockets have only one listener for messages where 
 as socket.io sockets have different listeners per type of message.)
 
As long as wbh are still stateful and statically assigned, each wbh is a single Actor.

Each Actor is assigned a Queue.

There is one Exchanger per Agent, one for the end users per Agent and one per LiveChat provider.

One an Actor connects, its type is determine by the URL it uses: eg. WBH 
of Agent 456 opens a socket to `ws://smartrouter.virtuoz.com/agent/456`, 
the UI for agent 456 will connect to `ws://smartrouter.virtuoz.com/ui/456`.

Upon connection the socket is bound to the corresponding queue: (pseudo js)

	var io = require('socket.io').listen(80);
	var amqp = require('amqp').createConnection('amqp://');

	var agent456 = io
	  .of('/agent/456') // handles connection on /agent/456
	  .on('connection', function (socket) {
		amqp.queue(socket.clientid, function (q) { // declares the queue named socket.clientid (we need to find what to put there).
		  q.bind('agent/456', socket.clientid); // binds the socket to the agent exchanger and say that only message corresponding to socket.clientId need to be routed on the queue
		  q.subscribe(function (message, headers, deliveryInfo) { // whenever we get a message on the queue, we send it back on the socket
			socket.emit(deliveryInfo.appId, message.data); // deliveryInfo.appId is the type of message (we need to find what to put there).
		  });
		});
	  });

Then the routing of the different events need to be registered:

	router.register(agent456);

With the function being something like:

	function register(endPoint) {
	  routes.forEach(function (item) {
		endPoint.on(item.event, item.routeAction);
	  });
	}

where routeAction is a function that takes the message and will give it 
to the right exchanger.

A message/event will have a type some metadata (at least some session ids) 
and a payload. The payload has to be small, we will prefer to send several 
messages instead of a big one.


To start the prototype:
	$ node lib/index.js &
	$ node mockactor/wbh.js &

