/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var assert = require('chai').assert;

var logger = require('../util/logger');

var smartrouter = require('../lib/smartrouter.js').instance;
var config = require('../config').local;
var Agent = require('./mockactors/wbh').Agent;
var UI = require('./mockactors/ui').UI;
var LiveChat = require('./mockactors/livechat').LiveChat;


var clientsParams = { reconnect: false, 'force new connection': true };

// /!\ Those tests need to have a local RabbitMQ running
describe('Smartrouter tests.', function()
{
  beforeEach(function(done)
         {
           logger.info('Will start smartrouter');
           smartrouter.once('started', function () {
             smartrouter.io.set('log level', 1);
             smartrouter.io.set('close timeout', .2);
             smartrouter.io.set('client store expiration', .2);
             logger.info('SmartRouter started');
             done();
           });

           smartrouter.start(config);
         });
  afterEach(function(done)
        {
          smartrouter.stop();
          smartrouter.once('stopped', function()
          {
            logger.info('smartrouter stopped');
            done();
          });
        });

  it('should connect an agent to the smartrouter', function(done)
  {
    console.log('starting agent test');
    var mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
    mockedAgent.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedAgent.socket.once('hello', function()
    {
      done();
    });
  });

  it('should connect an ui to the smartrouter', function(done)
  {
    console.log('starting ui test');
    var mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('localhost:8080', 'ui/456', 'ui456');
    mockedAgent.connect();
    mockedUI.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedUI.socket.once('hello', function()
    {
      done();
    });
  });

  it('sould connect a livechat to the smartrouter', function(done)
  {
    console.log('starting the livechat test');
    var mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
    var mockedLiveChat = new LiveChat('localhost:8080', 'livechat/456', 'livechat456', clientsParams);
    mockedAgent.connect();
    mockedLiveChat.connect();
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedLiveChat.socket.once('hello', function()
    {
      done();
    });
  });

  it('should send a message from the ui to the agent', function(done)
  {
    console.log('UI will send a message to the agent');
    var mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
    var mockedUI = new UI('localhost:8080', 'ui/456', 'ui456', clientsParams);
    mockedAgent.connect();
    mockedUI.connect();

    mockedAgent.socket.once('talk', function(data)
    {
      // Message has correctly been routed by the smartrouter!
      assert.equal('Hey is there someone?', data.payload.text);
    });
    // Mocked Agent is set to send back a 'hello from agent' message. Wait for it to finish the test
    mockedUI.socket.once('talkback', function(data)
    {
      assert.equal('hello from agent', data.payload.text);
      done();
    });

    // UI will talk after being handshaked by the smartrouter
    mockedUI.socket.once('hello', function()
    {
      mockedUI.talk('Hey is there someone?');
    });

  });

  it('should send a message from the agent to the UI', function(done)
  {
    console.log('Agent will send a message to the UI');
    var mockedAgent;
    var mockedUI = new UI('localhost:8080', 'ui/456', 'ui456', clientsParams);
    mockedUI.connect();

    mockedUI.socket.once('talkback', function(data)
    {
      // Received the response from the agent!
      assert.equal('Hello, I am your agent', data.payload.text);
      done();
    });

    mockedUI.socket.once('hello', function()
    {
      mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
      mockedAgent.connect();
      mockedAgent.socket.once('hello', function()
      {
        mockedAgent.UI = 'ui/456/ui456';
        mockedAgent.talk('Hello, I am your agent');
      });
    });
  });

  it('should make a session request to the livechat', function(done)
  {
    console.log('Agent will send a request to the livechat');
    var mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456', clientsParams);
    var mockedLiveChat = new LiveChat('localhost:8080', 'livechat/456', 'livechat456', clientsParams);
    var mockedUI = new UI('localhost:8080', 'ui/456', 'ui456', clientsParams);
    mockedAgent.connect();
    mockedLiveChat.connect();
    mockedUI.connect();

    mockedLiveChat.socket.once('sessionrequest', function()
    {
      done();
    });

    mockedUI.talk('livechat');
  });
});
