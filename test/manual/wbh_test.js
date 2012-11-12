/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var Agent = require('../../mockactors/wbh.js').Agent;

var wbh = new Agent('localhost:8080', 'agent/456', '10.50.61.103');
wbh.setup();

//setInterval(function () {
//  wbh.echo();
//  }, 30000);


//var wbh2 = new Agent('127.0.0.1:8080', 'agent/456', '10.50.61.104');
//wbh2.setup();

//setInterval(function () {
//  wbh2.echo();
//  }, 40000);