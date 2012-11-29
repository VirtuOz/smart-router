/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */
var config = require('../config').local;
var logger = require('../util/logger');

var smartrouter = require('./smartrouter.js').instance;

smartrouter.on('started', function () {
  logger.info('SmartRouter started');
});

smartrouter.start(config);
