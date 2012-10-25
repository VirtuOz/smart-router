/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-25
 */
 
var Actor = require('./actor');

var wbh = new Actor('localhost:8080', 'agent/456', '10.50.61.103');
wbh.setup();

setInterval(function () { 
  wbh.echo(); 
  }, 5000);
  

var wbh2 = new Actor('127.0.0.1:8080', 'agent/456', '10.50.61.104');
wbh2.setup();

setInterval(function () { 
  wbh2.echo(); 
  }, 5000);
