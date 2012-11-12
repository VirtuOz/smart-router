/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

/**
 * Winston logger instantiation.
 *
 * The configuration is done using node-config (see http://lorenwest.github.com/node-config/latest/)
 * Properties to define are:
 *   - log.level: debug, info, warn or error
 *   - log.filename
 * See ../config/development.yaml for example
 *
 * @author sbellone
 * @created 2012-11-08
 */

var winston = require('winston'),
    tty = require('tty'),
    CONFIG = require('config').log;

// Custom levels and color, more similar to log4j
// Default level are in npm-config, with DEBUG after INFO, weird
var customLevels = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  },
  colors: {
    debug: 'cyan',
    info: 'green',
    warn: 'magenta',
    error: 'red'
  }
};

var logger = winston.loggers.add('logger', {
  transports: [
    new (winston.transports.Console)(
        {
          level: CONFIG.level,
          colorize: tty.isatty(process.stdout.fd),
          json: false,
          timestamp: true
        }
    ),
    new (winston.transports.File)(
        {
          level: CONFIG.level,
          filename: CONFIG.filename,
          json: false
        })
  ]
});

logger.setLevels(customLevels.levels);
winston.addColors(customLevels.colors);

module.exports = winston.loggers.get('logger');
