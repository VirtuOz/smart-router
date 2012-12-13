/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var BasicActor = require('../mockactors/basicactor').BasicActor;

var actor1 = new BasicActor('http://localhost:8080', 'actor1/33', 'my_actor_id1');
var actor2 = new BasicActor('http://localhost:8080', 'actor2/33', 'actor_id2');
actor1.connect();
actor2.connect();

setTimeout(function () {
  actor1.talk('"Hello to global endpoint actor2/33"', 'actor2/33');
}, 1000);
