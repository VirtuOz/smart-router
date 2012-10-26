/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-26
 */
 
var Actor = require('./actor');

var ui = new Actor('localhost:8080', 'ui/456', '10.50.61.103');
ui.setup();

setInterval(function () { 
  ui.log('quack');
  ui.echo(); 
  }, 5000);
  
