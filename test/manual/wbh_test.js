/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var Agent = require('../mockactors/wbh.js').Agent;

var wbh = new Agent('localhost:8080', 'agent/456', 'wbh1_id');
wbh.setup();

//setInterval(function () {
//  wbh.echo();
//  }, 30000);

