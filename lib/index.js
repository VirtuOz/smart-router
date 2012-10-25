/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */
var config = require('../config').local;


var smartrouter = require('./smartrouter.js').instance;

smartrouter.on('started', function () {
  console.log('SmartRouter started');
});

smartrouter.start(config);
