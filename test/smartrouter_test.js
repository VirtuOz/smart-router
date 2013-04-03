/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var assert = require('chai').assert;
var io = require('socket.io-client');

var logger = require('../util/logger');

var SRLib = require('../lib');
var smartrouter = new SRLib.SmartRouter();
var config = require('./testconfig').local;
var Actor = SRLib.Actor;
var Agent = require('./mockactors/agent').Agent;
var UI = require('./mockactors/ui').UI;
var Service = require('./mockactors/service').Service;
var NagiosCheckResponse = require('nagios').NagiosCheckResponse;
var NagiosCheckResponseCodes = require('nagios').NagiosCheckResponseCodes;
var nock = require('nock');
var utils = require('./utils');

/* We instantiate the clients with the following params to be able to
 * properly shutdown the smart-router between tests.
 */
var clientsParams = { reconnect:false, 'force new connection':true };

// /!\ Those tests need to have a local RabbitMQ running
describe('Smartrouter tests.', function ()
{
  beforeEach(function (done)
             {
               utils.startSmartRouter(config, logger, smartrouter, done);
             });
  afterEach(function (done)
            {
              utils.stopSmartRouter(logger, smartrouter, done);
            });


  it('will create a raw Actor, connect it to the smartrouter and make an echo', function (done)
  {
    logger.debug('************************************************************');
    logger.debug('STARTING TEST "connect an Actor to the smartrouter and ECHO"');
    logger.debug('************************************************************');
    var actor = new Actor('http://localhost:' + config.port.toString(), 'agent/456', 'rawActor', clientsParams);
    actor.connect();

    actor.socket.once('hello', function ()
    {
      actor.echo();
    });
    actor.socket.once('echo', function ()
    {
      // Echo received back
      done();
    });
  });

  it('should connect an agent to the smartrouter', function (done)
  {
    logger.debug('***************************************************');
    logger.debug('STARTING TEST "connect an agent to the smartrouter"');
    logger.debug('***************************************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    mockedAgent.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedAgent.socket.once('hello', function ()
    {
      done();
    });
  });

  it('should connect an ui to the smartrouter', function (done)
  {
    logger.debug('************************************************');
    logger.debug('STARTING TEST "connect an UI to the smartrouter"');
    logger.debug('************************************************');
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedUI.socket.once('hello', function ()
    {
      done();
    });
  });

  it('sould connect a service to the smartrouter', function (done)
  {
    logger.debug('*****************************************************');
    logger.debug('STARTING TEST "connect a service to the smartrouter"');
    logger.debug('*****************************************************');
    var mockedService = new Service('http://localhost:' + config.port.toString(), 'service/456', 'service456', clientsParams);
    mockedService.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedService.socket.once('hello', function ()
    {
      done();
    });
  });

  it('should send a message from the ui to the agent, which will reply', function (done)
  {
    logger.debug('***********************************');
    logger.debug('STARTING TEST "UI talk to an agent"');
    logger.debug('***********************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedAgent.connect();
    mockedUI.connect();

    mockedAgent.socket.once('talk', function (data)
    {
      // Message has correctly been routed by the smartrouter!
      assert.equal('Hey is there someone?', data.payload.text);
    });
    // Mocked Agent is set to send back a 'hello from agent' message. Wait for it to finish the test
    mockedUI.socket.once('talkback', function (data)
    {
      assert.equal('hello from agent', data.payload.text);
      done();
    });

    // UI will talk after being handshaked by the smartrouter
    mockedUI.socket.once('hello', function ()
    {
      mockedUI.talk('Hey is there someone?');
    });
  });

  it('should send a message from the agent to the UI', function (done)
  {
    logger.debug('************************************');
    logger.debug('STARTING TEST "Agent talk to the UI"');
    logger.debug('************************************');
    var mockedAgent;
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();

    mockedUI.socket.once('talkback', function (data)
    {
      // Received the response from the agent!
      assert.equal('Hello, I am your agent', data.payload.text);
      done();
    });

    mockedUI.socket.once('hello', function ()
    {
      mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
      mockedAgent.connect();
      mockedAgent.socket.once('hello', function ()
      {
        // Normally, UI has sent a message containing its id that the Agent has stored
        mockedAgent.UI = mockedUI.actorid;
        mockedAgent.talk('Hello, I am your agent');
      });
    });
  });

  it('should make a session request to the service', function (done)
  {
    logger.debug('*******************************************');
    logger.debug('STARTING TEST "Requesting service session"');
    logger.debug('*******************************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    var mockedservice = new Service('http://localhost:' + config.port.toString(), 'service/456', 'service456', clientsParams);
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedAgent.connect();
    mockedservice.connect();
    mockedUI.connect();

    mockedservice.socket.once('sessionrequest', function ()
    {
      done();
    });

    // MockedAgent is configured to send a 'sessionrequest' to the service when the UI says "service"
    mockedUI.socket.once('hello', function ()
    {
      mockedUI.talk('service');
    });
  });

  it('service will send a message to the ui', function (done)
  {
    logger.debug('********************************************');
    logger.debug('STARTING TEST "service will talk to the UI"');
    logger.debug('********************************************');
    var mockedservice;
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();

    mockedUI.socket.once('talkback', function (data)
    {
      // Received the response from the agent!
      assert.equal('Hello, how can I help you?', data.payload.text);
      done();
    });

    mockedUI.socket.once('hello', function ()
    {
      mockedservice = new Service('http://localhost:' + config.port.toString(), 'service/456', 'service456', clientsParams);
      mockedservice.connect();
      mockedservice.socket.once('hello', function ()
      {
        // Normally, Agent has previously sent a message containing the UI's id that the service has stored
        mockedservice.UI = mockedUI.actorid;
        mockedservice.talk('Hello, how can I help you?');
      });
    });
  });

  // UI will publish a message to the agent queue, which is not connected yet.
  // Then the targeted agent connects. It should receive the message.
  it('should keep the message in the Queue until the actor connect and get it', function (done)
  {
    logger.debug('*****************************************************************************************');
    logger.debug('STARTING TEST "SmartRouter keep message in memory if the targeted actor is not connected"');
    logger.debug('*****************************************************************************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();
    mockedUI.socket.once('hello', function ()
    {
      mockedUI.talk('This message will not be delivered immediately');
    });

    setTimeout(function ()
               {
                 mockedAgent.connect();
                 mockedAgent.socket.once('talk', function (data)
                 {
                   // Message has been kept waiting for agent to connect
                   assert.equal('This message will not be delivered immediately', data.payload.text);
                   done();
                 });
               }, 1000);
  });

  // UI will publish a message to the agent queue, which is not connected yet.
  // We shutdown the smart-router, and restart it
  // We connect the targeted agent, and we check that the message survived the shutdown
  it('should keep the message in RabbitMQ during a smart-router shutdown', function (done)
  {
    logger.debug('**********************************************************');
    logger.debug('STARTING TEST "Messages survive the smart-router shutdown"');
    logger.debug('**********************************************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();
    mockedUI.socket.once('hello', function ()
    {
      mockedUI.talk('This message will survive a shutdown');
    });

    setTimeout(function ()
               {
                 smartrouter.stop();
                 smartrouter.once('stopped', function ()
                 {
                   logger.info('Smartrouter stopped. We hope no message will be lost. Restarting...');
                   smartrouter.start(config);
                 });
               }, 1000);

    smartrouter.once('started', function ()
    {
      smartrouter.io.set('log level', 1);
      smartrouter.io.set('close timeout', .2);
      smartrouter.io.set('client store expiration', .2);
      logger.info('SmartRouter restarted. Connecting the agent to it');
      mockedAgent.connect();
      // We should receive the message sent by the UI before the shutdown
      mockedAgent.socket.once('talk', function (data)
      {
        // Message has been kept in RabbitMQ!
        assert.equal('This message will survive a shutdown', data.payload.text);
        done();
      });
    });
  });

  // We will try to connect on an undefined endpoint (/agent/458).
  // As it is not registered, we will not receive the handshake and will be disconnected (timeout = 200ms).
  // Then we send a 'registerNewEndpointId' for /agent/458, and we try again to connect.
  it('should add a new endpoint for a given actor', function (done)
  {
    logger.debug('***********************************************************');
    logger.debug('STARTING TEST "We will add a new Endpoint ID for the Agent"');
    logger.debug('***********************************************************');
    var handshakedBeforeRegistration = false;
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/458', 'agent458', clientsParams);
    mockedAgent.connect();

    mockedAgent.socket.once('disconnect', function ()
    {
      logger.debug('We have been disconnected without handshake because endpoint 458 is not registered.');
      var socket = io.connect('http://localhost:' + config.port.toString());
      socket.once('connect', function ()
      {
        socket.emit('registerNewEndpointId', { name:'agent', id:458 });
        socket.on('endpointRegistered', function ()
        {
          logger.debug('Now that endpoint 458 is registered, we will be handshaked.');
          mockedAgent.connect();
          mockedAgent.socket.once('hello', function ()
          {
            assert.isFalse(handshakedBeforeRegistration);
            done();
          });
        });
      });
    });
    mockedAgent.socket.once('hello', function ()
    {
      // We will never pass here because agent/458 is not registered yet
      handshakedBeforeRegistration = true;
    });
  });

  it('should set client queue as markedForDeletion after client disconnect', function (done)
  {
    logger.debug('********************************************************************');
    logger.debug('STARTING TEST "Mark actor queues for deletion after they disconnect"');
    logger.debug('********************************************************************');
    var mockedAgent = new Agent('http://localhost:' + config.port.toString(), 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('http://localhost:' + config.port.toString(), 'ui/456', 'ui456', clientsParams);
    mockedAgent.connect();
    mockedUI.connect();
    mockedUI.socket.once('disconnect', function () // clients are disconnected automatically after 200ms
    {
      // We wait 200ms to be sure we have unsubscribed from RabbitMQ and we test which queue is marked for deletion.
      setTimeout(function() {
        console.log(smartrouter._queuesMarkedForDeletion);
        assert.isDefined(smartrouter._queuesMarkedForDeletion['ui/456/ui456']);
        assert.isUndefined(smartrouter._queuesMarkedForDeletion['agent/456/agent456']); // Endpoints queues are not deleted.
        done();
      }, 200);
    });
  });

  it('should delete a queue in RabbitMQ', function (done)
  {
    logger.debug('******************************************');
    logger.debug('STARTING TEST "Delete a Queue in RabbitMQ"');
    logger.debug('******************************************');
    var queueName = 'test_queue';
    smartrouter.amqp.queue(queueName, { autoDelete: false, closeChannelOnUnsubscribe: true }, function (q) {
    })
    .on('open', function() {
      smartrouter.queueDestroy(queueName);
      // Wait 200ms and check if the queue is correctly deleted in RabbitMQ using a passive queue.
      setTimeout(function() {
        smartrouter.amqp.queue(queueName, { passive: true }, function(q) {
        })
        .on('error', function() {
          logger.debug('Queue ' + queueName + ' does not exists anymore');
          done();
        });
      }, 200);
    });
  });

  describe('nagios responses', function ()
  {
    it('should return a single OK event', function (done)
    {
      //First call to get rid of any error message from other test.
      smartrouter.nagiosCheck(function ()
                              {
                              });
      smartrouter.nagiosCheck(function (err, nagiosEvents)
                              {
                                assert.isUndefined(err);
                                assert.isTrue(Array.isArray(nagiosEvents));
                                assert.equal(nagiosEvents.length, 1);
                                assert.deepEqual(JSON.stringify(nagiosEvents[0]),
                                                 JSON.stringify(new NagiosCheckResponse(NagiosCheckResponseCodes.OK, "EventsController", "0 OK 0:1")));
                                done();
                              });
    });

    it('should return a single error event', function (done)
    {
      // Simulate the logging of an event.
      var simulatedEvent = new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "Wibble", "Giblets");
      smartrouter._storeNagiosEvent(simulatedEvent);

      // Now call the Nagios check method.
      smartrouter.nagiosCheck(function (err, nagiosEvents)
                              {
                                assert.isUndefined(err);
                                assert.isTrue(Array.isArray(nagiosEvents));
                                assert.equal(nagiosEvents.length, 1);
                                assert.deepEqual(nagiosEvents[0], simulatedEvent);
                                done();
                              });
    });

    it('should return multiple events', function (done)
    {
      // Simulate the logging of an event.
      var simulatedErrorEvent = new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "ERROR", "ERROR");
      var simulatedWarningEvent = new NagiosCheckResponse(NagiosCheckResponseCodes.WARNING, "WARNING", "WARNING");
      var simulatedOKEvent = new NagiosCheckResponse(NagiosCheckResponseCodes.OK, "OK", "OK");
      smartrouter._storeNagiosEvent(simulatedErrorEvent);
      smartrouter._storeNagiosEvent(simulatedWarningEvent);
      smartrouter._storeNagiosEvent(simulatedOKEvent);

      // Now call the Nagios check method.
      smartrouter.nagiosCheck(function (err, nagiosEvents)
                              {
                                assert.isUndefined(err);
                                assert.isTrue(Array.isArray(nagiosEvents));
                                assert.equal(nagiosEvents.length, 3);
                                assert.deepEqual(nagiosEvents[0], simulatedErrorEvent);
                                assert.deepEqual(nagiosEvents[1], simulatedWarningEvent);
                                assert.deepEqual(nagiosEvents[2], simulatedOKEvent);
                                done();
                              });
    });

    it('should limit the number of events stored', function (done)
    {
      // We log 100 events.  That's the default number to store.  We should get 100 events back from the
      // Nagios check.
      for (var i = 0; i < 100; i++)
      {
        smartrouter._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "ERROR-" + i, "ERROR-" + i));
      }

      // Now call the Nagios check method.
      smartrouter.nagiosCheck(function (err, nagiosEvents)
                              {
                                assert.isUndefined(err);
                                assert.isTrue(Array.isArray(nagiosEvents));
                                assert.equal(nagiosEvents.length, 100);

                                // Make sure everything was stored properly.
                                for (var i = 0; i < 100; i++)
                                {
                                  assert.deepEqual(nagiosEvents[i], new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "ERROR-" + i, "ERROR-" + i));
                                }

                                // Now store 101 events.  This time the first one will be dropped because it's the oldest.
                                for (i = 0; i < 101; i++)
                                {
                                  smartrouter._storeNagiosEvent(new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "ERROR-" + i, "ERROR-" + i));
                                }

                                smartrouter.nagiosCheck(function (err, nagiosEvents)
                                                        {
                                                          assert.isUndefined(err);
                                                          assert.isTrue(Array.isArray(nagiosEvents));
                                                          assert.equal(nagiosEvents.length, 100);

                                                          // Make sure everything was stored properly.
                                                          for (var i = 0; i < 100; i++)
                                                          {
                                                            assert.deepEqual(nagiosEvents[i], new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "ERROR-" + (i + 1), "ERROR-" + (i + 1)));
                                                          }

                                                          done();
                                                        });
                              });
    });
  });
});
