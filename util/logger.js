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
    CONFIG = require('config');

// Custom levels and color, more similar to log4j
// Default level are in npm-config, with DEBUG after INFO, weird
var customLevels = {
  levels: {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4
  },
  colors: {
    trace: 'blue',
    debug: 'cyan',
    info: 'green',
    warn: 'magenta',
    error: 'red'
  }
};

if (!CONFIG.log) {
  console.warn("CONFIG.log properties are not defined, activating console by default (level will be INFO).");
  CONFIG.log = { consoleLogger: true, fileLogger: false };
}
console.log("Enabled loggers: Console=" + CONFIG.log.consoleLogger + ", File=" + CONFIG.log.fileLogger);
var transports = [];
if (CONFIG.log.consoleLogger) {
  transports.push(new (winston.transports.Console)(
    {
      level: CONFIG.log.level,
      colorize: tty.isatty(process.stdout.fd),
      json: false,
      timestamp: true
    }
  ));
}
if (CONFIG.log.fileLogger) {
  transports.push(new (winston.transports.File)(
    {
      level: CONFIG.log.level,
      filename: CONFIG.log.filename,
      json: false,
      maxsize:CONFIG.log.maxSize,
      maxFiles:CONFIG.log.maxFiles
    }
  ));
}

var logger = winston.loggers.add('logger', { transports: transports });

logger.setLevels(customLevels.levels);
winston.addColors(customLevels.colors);

module.exports = winston.loggers.get('logger');
