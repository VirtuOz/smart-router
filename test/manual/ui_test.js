/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var UI = require('../mockactors/ui').UI;

var ui = new UI('http://localhost:8080', 'ui/456', 'ui_id');
ui.connect();

setTimeout(function () {
  ui.talk('hello world!');
}, 1000);

setTimeout(function () {
  ui.talk('hello goodbye!');
}, 3000);

setTimeout(function () {
  ui.talk('livechat');
}, 7000);

setTimeout(function () {
  ui.talk('woohoo');
}, 10000);

/*setInterval(function () {
 ui.log('quack');
 ui.echo();
 }, 5000);
 */