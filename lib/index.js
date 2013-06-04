/*
 * Copyright 2012 VirtuOz Inc.  All rights reserved.
 */

/**
 *
 * @author ccauchois
 * @created 2012-10-24
 */

var fs = require('fs');

if (!process.env.NODE_CONFIG_DIR && !fs.existsSync(process.cwd() + '/config')) {
  var tmpDir = require('os').tmpDir() + '/smartrouter';
  console.warn('NODE_CONFIG_DIR is not set. Using default directory: ' + tmpDir);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
  process.env.NODE_CONFIG_DIR = tmpDir;
}

exports.SmartRouter = require('./smartrouter');
exports.Actor = require('./actor');
exports.const = require('./const');