smart-router
============

The *smart-router* is a message routing system that routes messages based on their content. 
It is meant to be light-weight and HA. Internally, it uses [RabbitMQ](http://www.rabbitmq.com/)
to handle the messages and [socket.io](http://socket.io/) as its transport protocol. It can be 
used to connect server-side services as well as client-side applications.

To use it:
```
npm install smart-router
```

Concepts
--------
### Endpoints
The *smart-router* will listen to several endpoints or sub-endpoints as defined in its config file. One end point can be 
divided into sub-endpoints who will share the same route definitions, but if an endpoint has sub-endpoints, the *smart-router*
will listen to the sub-endpoints and not the endpoint itself. 

### Actors 
An Actor is a client of the *smart-router*. It has its own unique Id. It will connect to an endpoint or a sub-endpoint
to publish and receive messages. They can be configured to receive messages sent directly to them or sent to their 
endpoint.

### Messages
Messages are exchanged by the Actors through the *smart-router*. It will then introspect them to route them to the 
right actor or to the right endpoint for one actor to pick them up.

A message has a type and a body which can be repesented like that:
```javascript
{ 
  ids: { },
  metadata: { },
  payload: { }
}
```
**ids** contains the ids of the actors or endpoints concerned by the message. By looking, preferably, at the **metadata**,
the *smart-router* will choose which of these actors it will route the message to. The **payload** contains application 
specific data, whereas **metadata** will contain data used by the routing. (The *smart-router* still has access to the 
**payload** and can decide using it, but it is better to have a clean separation between the two.)

### Routes
A Route is a function that is called when the *smart-router* receives a message of a specific type on a specific end point.
In this function, the *smart-router* can look at the endpoint, the message type and the message body to define wht to do 
with it. Usually, it will publish it as-is to another and point or actor, but it can modify it, fork it and publish it to 
several endpoints.
In the following route, when we receive a message of type **business** from the **serviceA** endpoint, we check if it is
important. If it is, we route it to **serviceC** enpoint as an **important** message and log it by sending it to the logger
as a **log** message. If not, we forward it as-is to **serviceB**.
```javascript
{ 
  endpoint: 'serviceA', 
  messagetype: 'business',
  action: function (message, socket, smartrouter) {  
    if (message.ids.serviceC && message.metadata.isImportant) {
      smartrouter.publish(message.ids.serviceC, 'important', message);
      smartrouter.publish(message.ids.logger, 'log', message);
    } 
    else {
      smartrouter.publish(message.ids.serviceB, 'business', message); 
    }
  }
}
``` 

### Queues and Exchanges
Queues and Exchanges are an internal notion. Actors don't see the queues and don't know about them. Internally, the route 
functions will
publish messages to some queues and when a new actor connects, it will subscribe to one or two queues. 
One exchange is created per (sub)endpoint. Queues exist at the 
(sub)endpoint or actor level, depending on the flags used in the configuration of the endpoint.
```javascript
  endpoints: [ 
    { name: 'endpoint', queue: QUEUEFLAG.endpoint },
    { name: 'subendpoint', sub: [ 456, 457 ], queue: QUEUEFLAG.endpoint },
    { name: 'actoronly', sub: [ 'subactor' ], queue: QUEUEFLAG.actor }, // QUEUEFLAG.actor is the default value
    { name: 'endpointandactor', queue: QUEUEFLAG.endpoint | QUEUEFLAG.actor }
  ]
```
With this configuration, the *smart-router* will listen to:
* `/endpoint`
* `/subendpoint/456`
* `/subendpoint/457`
* `/actoronly/456`
* `/endpointandactor`

and will use the following queues:
* `endpoint` of exchange `endpoint`
* `subendpoint/456` of exchange `subendpoint/456`
* `subendpoint/457` of exchange `subendpoint/457`
* `<actorid>` of exchange `actoronly/456` where _actorid_ is the unique id of the actors connectiong to the end point
* `endpointandactor` of exchange `endpointandactor`
* `<actorid>` of exchange `endpointandactor` where _actorid_ is the unique id of the actors connectiong to the end point

During its transit inside the *smart-router*, a message will:
1. be received on the endpoint
2. routed using the corresponding route function 
3. queued on the queue selected by the routing function
4. dequeued and
5. sent to an actor.

### High Availability
Internally, the *smart-router* is composed of two modules:
* a socket.io server written in node.js that handles the routing of the messages
* a RabbitMQ cluster that handles the persistence and the publication of the messages.
Any number of the node.js application can be deployed as long as they all connect to the same RabbitMQ cluster. A single message 
can be queued by one instance and dequeued by another. As long as the RabbitMQ is correctly [set up](http://www.rabbitmq.com/clustering.html)
to [mirror](http://www.rabbitmq.com/ha.html) the queues,
there is no SPoF.

Usage
-----

### Smart-router configuration

On start, the smart-router will read a configuration object.
This configuration will contain:

- `port` The port on which the smart-router will listen.
- `amqp` The [amqp connection options](https://github.com/postwait/node-amqp#connection-options-and-url).
- `endpoints` The endpoints configuration. Will define endpoints' names and the socket's namespaces
    on which the smart-router will listen. Actors will connect on these endpoints.
    This object will be an array of objects containing the following properties:
    - `name` Endpoint's name.
    - `sub` List containing endpoint's sub-endpoints. This will determine on which namespaces the smart-router will listen: If
        no sub are present, it will listen on `/name`. If sub are set, it will listen on `/name/id1`, `/name/id2`, ...
    - `queue` A flag to determine the queue(s) which will be created for the endpoint. Use ('./lib').const.QUEUEFLAG
        to set it. If there is no flag or if `QUEUEFLAG.actor` is set, smart-router will create a queue named
        with the actorId which has established a connection on the namespace.
        If the flag `QUEUEFLAG.endpoint` is set, the smart-router will create a generic queue named `endpointName/subendpoint`.
- `routes` Array of configuration objects which will define actions to do for each type of message received on an endpoint.
    Each object will contains:
    - `endpoint` Endpoint's name (one of those defined in `endpoints` configuration).
    - `messagetype` The name of the event that the smart-router will listen for.
    - `action: function(message, socket, smartrouter)` A function which will be called once we receive the event
        `messagetype` on the `endpoint`. **It's here that you need to route the received message.** Typically,
        you will do something like: `smartrouter.publish(queueId, 'messagetype', message)` which will publish a
        message of type `messagetype` to the queue `queueid`.

### Handshake protocol
If you develop your actors in JS, you only have to use the `Actor` class as describe in the next section.

In any other language, you would need to use a [socket.io](http://socket.io/) client and to implement the
handshake protocol:

1. when a new Actor connects, the *smart-router* emits an empty `whoareyou` message.
2. the Actor must respond with a `iam` message whose payload will be its unique id. These ids have to be unique 
through out the whole plateform.
3. the *smart-router* responds then with a `hello` empty message.
4. when receiving a message from an unknown Actor (unknown unique id), the *smart-router* will emit a `whoareyou` message 
containing the previous message as a payload (`payload.type` being the message type, and `payload.message` the message body.)
5. it is expected that the Actor then emits a `iam` with its id and re-emits the rejected message. 

### Writing actors

In JS, all actors need to extend the raw Actor class defined in `lib/actor.js`.

```javascript
var Actor = require('smart-router').Actor;

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


### Examples

#### Basic
An example of basic actor can be found in `example/basic.js`.
The scenario is very simple:

- Actor1 starts by sending a 'message' which will be published to the queue `actor/2` (subscribed by actor2).
- The message is routed to actor2 which reply to the queue `actor/1/my_actor_id1` (subscribed by actor1)
- The message is routed to actor1 which reply to the queue `actor/2/actor_id2` (subscribed by actor2)
- ...
It stops after two back and forth.

#### Tests
The test folder contains different actors used to test the behaviour of the *smart-router*.

1. `agent` is the main actor. It will decide of the flow of the messages by adding some metadata.
2. `ui` simulates a UI. It can request to *talk* to the external `service`.
3. `service` is an external service to which some messages can get routed.

Use `mocha` from the command line to launch the tests.

LICENSE
=======

Copyright 2012 VirtuOz, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
