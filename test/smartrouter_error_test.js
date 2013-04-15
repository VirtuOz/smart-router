/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var assert = require('chai').assert;
var io = require('socket.io-client');

var logger = require('../util/logger');

var SRLib = require('../lib');
var smartrouter = new SRLib.SmartRouter();
var smConfig = require('./testconfig').local;
var Actor = SRLib.Actor;
var CONFIG = require('config');
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
describe('SmartRouter Error cases', function ()
{
  beforeEach(function (done)
             {
               utils.startSmartRouter(smConfig, logger, smartrouter, done);
             });
  afterEach(function (done)
            {
              CONFIG.rabbitmqReconnectDelay = 10000;
              utils.stopSmartRouter(logger, smartrouter, done);
            });

  describe('Error cases', function ()
  {
    it('should have an error as the endPoint is not known in the config', function (done)
    {
      var socket = io.connect('http://localhost:' + smConfig.port.toString());
      var errorExpected = '[toto] is not a valid Endpoint.';
      //Let's try to register an unknown endpoint
      socket.once('connect', function ()
      {
        // Now call the Nagios check method.
        socket.once('endpointRegistrationError', function (err)
        {
          assert.deepEqual(err, new Error(errorExpected));
          smartrouter.nagiosCheck(function (err, nagiosEvents)
                                  {
                                    assert.isUndefined(err);
                                    assert.isTrue(Array.isArray(nagiosEvents));
                                    assert.equal(nagiosEvents.length, 1);
                                    console.log(JSON.stringify(nagiosEvents[0]));
                                    assert.deepEqual(nagiosEvents[0], new NagiosCheckResponse(NagiosCheckResponseCodes.ERROR, "EventsController", errorExpected));
                                    done();
                                  });
        });
        socket.emit('registerNewEndpointId', { name:'toto', id:458 });
      });
    });

    it('should have a warning as the endpoint is already known', function (done)
    {
      var socket = io.connect('http://localhost:' + smConfig.port.toString());
      var warnExpected = 'Endpoint [/agent/456] already exists. Aborted.';
      //Let's try to register an unknown endpoint
      socket.once('connect', function ()
      {
        // Now call the Nagios check method.
        socket.once('endpointRegistered', function (err)
        {
          assert.deepEqual(err, new Error(warnExpected));
          smartrouter.nagiosCheck(
              function (err, nagiosEvents)
              {
                assert.isUndefined(err);
                assert.isTrue(Array.isArray(nagiosEvents));
                assert.equal(nagiosEvents.length, 1);
                console.log(JSON.stringify(nagiosEvents[0]));
                assert.deepEqual(nagiosEvents[0], new NagiosCheckResponse(NagiosCheckResponseCodes.WARNING, "EventsController", warnExpected));
                done();
              });
        });
        socket.emit('registerNewEndpointId', { name:'agent', id:456 });
      });
    });

    it('RabbitMQ connection error correctly handle', function (done)
    {
      var smartrouterThatWillFailed = new SRLib.SmartRouter();
      var error_msg_expected = /Error while connecting to RabbitMQ: Error: getaddrinfo (ENOENT|ENOTFOUND). Will try to reconnect in 10000/;
      smartrouterThatWillFailed.once('amqpError', function (err)
      {
        console.log(err.message);
        assert.match(err.message, error_msg_expected);
        //We need to check nagios here.
        smartrouterThatWillFailed.nagiosCheck(
            function (err, nagiosEvents)
            {
              assert.isUndefined(err);
              assert.isTrue(Array.isArray(nagiosEvents));
              assert.equal(nagiosEvents.length, 1);
              console.log(JSON.stringify(nagiosEvents[0]));
                assert.equal(nagiosEvents[0].code, NagiosCheckResponseCodes.ERROR);
                assert.equal(nagiosEvents[0].subSystemName, "EventsController");
                assert.match(nagiosEvents[0].description, error_msg_expected);
              //We check that we correctly received the event error for the first error.
              done();
            });
      });
      var badConfig = JSON.parse(JSON.stringify(smConfig));
      badConfig.amqp =  { url: 'amqp://unknown.host.toto' };
      smartrouterThatWillFailed.start(badConfig);
    });

    it('RabbitMQ connection error the first time, will retry after the configured number of second', function (done)
    {
      var correctSmartRouter = new SRLib.SmartRouter();
      var error_has_occured = false;
      var error_msg_expected = /^Error while connecting to RabbitMQ: Error: getaddrinfo (ENOENT|ENOTFOUND). Will try to reconnect in 100/;
      correctSmartRouter.once('amqpError', function (err)
      {
        console.log(err.message);
        assert.match(err.message, error_msg_expected);
        error_has_occured = true;
      });
      correctSmartRouter.once('started', function ()
      {
        //We need to check nagios here.
        correctSmartRouter.nagiosCheck(
            function (err, nagiosEvents)
            {
              assert.isUndefined(err);
              assert.isTrue(Array.isArray(nagiosEvents));
              assert.equal(nagiosEvents.length, 1);
              console.log(JSON.stringify(nagiosEvents[0]));
              assert.equal(nagiosEvents[0].code, NagiosCheckResponseCodes.ERROR);
              assert.equal(nagiosEvents[0].subSystemName, "EventsController");
              assert.match(nagiosEvents[0].description, error_msg_expected);
              //We check that we correctly received the event error for the first error.
              done(error_has_occured ? undefined : new Error('Never called the error'));
            });
      });
      var myConfig = JSON.parse(JSON.stringify(smConfig));
      myConfig.amqp =  { url: 'amqp://mynock.toto.fr' };
      //We change this to not wait 3 plombes
      CONFIG.rabbitmqReconnectDelay = 100;
      correctSmartRouter.start(myConfig);
      //Now let's set the correct url
      correctSmartRouter.amqp.setOptions(smConfig.amqp);
    });
  });
});
