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
	$ node test/manual/wbh_test.js &
	$ node test/manual/livechat_test.js &
	$ node test/manual/ui_test.js &


## Configuring and launching a smart-router - Writing actors
### Smart-router configuration

On start, the smart-router will read a configuration object.
This configuration will contain:

- `port` The port on which the smart-router will listen.
- `amqp` The [amqp connection options](https://github.com/postwait/node-amqp#connection-options-and-url).
- `endpoints` The endpoints configuration. Will define endpoints' names and the socket's namespaces
    on which the smart-router will listen. Actors will connect on these endpoints.
    This object will be an array of objects containing the following properties:
    - `name` Endpoint's name.
    - `ids` List containing endpoint's ids. This will determine on which namespaces the smart-router will listen: If
        no ids are present, it will listen on `/name`. If ids are set, it will listen on `/name/id1`, `/name/id2`, ...
    - `queue` A flag to determine the queue(s) which will be created for the endpoint. Use ('./lib/const/').QUEUEFLAG
        to set it. If there is no flag or if `QUEUEFLAG.actor` is set, smart-router will create a queue named
        with the actorId which has established a connection on the namespace.
        If the flag `QUEUEFLAG.endpoint` is set, the smart-router will create a generic queue named `endpointName/endpointId`.
- `routes` Array of configuration objects which will define actions to do for each type of message received on an endpoint.
    Each object will contains:
    - `endpoint` Endpoint's name (one of those defined in `endpoints` configuration).
    - `messagetype` The name of the event that the smart-router will listen for.
    - `action: function(message, socket, smartrouter)` A function which will be called once we receive the event
        `messagetype` on the `endpoint`. **It's here that you need to route the received message.** Typically,
        you will do something like: `smartrouter.publish(queueId, 'messagetype', message)` which will publish a
        message of type `messagetype` to the queue `queueid`.

### Writing actors

All actors need to extend the raw Actor class defined in `lib/actor.js`.

```javascript
var Actor = require('lib/actor');

MyActor = new JS.Class(Actor, {

  connect: function() {
    var socket = this.callSuper();
    socket.on('myactorevent', function(data) {
      // do some awesome stuff
      socket.emit('responseevent', message);
    };
    socket.on('otheractorevent', function(data) {
      // do other stuff
    };
  },

  my_actor_method : function() {
  }
});
```

As you see, the only mandatory thing to do in an actor is to extends the `connect()`
function, to get a reference on the socket by calling its parent, and to add listeners on it.
Of course listeners must match the `messagetype` you have configured in `routes`.

Then, you are able to instantiate your actor:

```javascript
new MyActor('localhost:8080', 'endpoint', 'my_actor_id');
```

### Running test configuration

An example of basic smart-router configuration can be found in `config/index.js` (exported as `basic`).
To run the smart-router with this basic configuration, simply do:

```javascript
var config = require('../config').basic;
var smartrouter = require('./smartrouter.js').instance;

smartrouter.on('started', function () {
  console.log('SmartRouter started');
});

smartrouter.start(config);
```

An example of basic actor can be found in `test/mockactors/basicactor.js`.
A test scenario can be launch with `node test/manual/basic_actors_test.js`. The scenario is very simple:

- Actor1 starts by making a 'talk' which will be published to the queue `actor2/33` (subscribed by actor2).
- The message is routed to actor2 which reply to the queue `actor1/33/my_actor_id1` (subscribed by actor1)
- The message is routed to actor1 which reply to the queue `actor2/33/actor_id2` (subscribed by actor2)
- The message is routed to actor2 ...
