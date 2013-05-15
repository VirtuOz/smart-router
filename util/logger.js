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

console.log("Enabled loggers: Console=" + CONFIG.consoleLogger + ", File=" + CONFIG.fileLogger);
var transports = [];
if (CONFIG.consoleLogger) {
  transports.push(new (winston.transports.Console)(
    {
      level: CONFIG.level,
      colorize: tty.isatty(process.stdout.fd),
      json: false,
      timestamp: true
    }
  ));
}
if (CONFIG.fileLogger) {
  transports.push(new (winston.transports.File)(
    {
      level: CONFIG.level,
      filename: CONFIG.filename,
      json: false,
      maxsize:CONFIG.maxSize,
      maxFiles:CONFIG.maxFiles
    }
  ));
}

var logger = winston.loggers.add('logger', { transports: transports });

logger.setLevels(customLevels.levels);
winston.addColors(customLevels.colors);

module.exports = winston.loggers.get('logger');
