/**
 * Start the smart router and call the callback function when started
 */
var startSmartRouter = function(config, logger, smartrouter, callback)
{
  smartrouter.once('started', function ()
  {
    smartrouter.io.set('log level', 1);
    smartrouter.io.set('close timeout', .2);
    smartrouter.io.set('client store expiration', .2);
    logger.info('SmartRouter started');
    callback();
  });

  smartrouter.start(config);
}

/**
 * Stop the smart router and call the callback when stopped
 */
var stopSmartRouter = function (logger, smartrouter, callback)
{
  smartrouter.stop();
  smartrouter.once('stopped', function ()
  {
    logger.info('Smartrouter stopped');
    callback();
  });
}

module.exports = {
  startSmartRouter: startSmartRouter,
  stopSmartRouter : stopSmartRouter
};