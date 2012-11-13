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


// MockActors
var mockedAgent;
var mockedUI;
var mockedLiveChat;

// /!\ Those tests need to have a local RabbitMQ running
describe('Smartrouter tests.', function()
{
  beforeEach(function(done)
         {
           logger.info('Will start smartrouter');
           smartrouter.once('started', function () {
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
    mockedAgent = new Agent('localhost:8080', 'agent/456', 'agent456');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedAgent.socket.once('hello', function()
    {
      done();
    });
    mockedAgent.setup();
  });

  it('sould connect an ui to the smartrouter', function(done)
  {
    console.log('starting ui test');
    mockedUI = new UI('127.0.0.1:8080', 'ui/456', 'ui456');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedUI.socket.once('hello', function()
    {
      done();
    });
    mockedUI.setup();
  });

  it('sould connect a livechat to the smartrouter', function(done)
  {
    console.log('starting the livechat test');
    mockedLiveChat = new LiveChat('localhost:8080', 'livechat/456', 'livechat456');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedLiveChat.socket.once('hello', function()
    {
      done();
    });
    mockedLiveChat.setup();
  });

  it('should send a message from the ui to the agent', function(done)
  {
    console.log('UI will send a message to the agent');
    mockedAgent.socket.once('talk', function(data)
    {
      // Message has correctly been routed by the smartrouter!
      assert.equal('Hey is there someone?', data.payload.text);
    });
    // Mocked Agent is set to send back a 'hello again' message. Wait for it to finish the test
    mockedUI.socket.once('talkback', function(data)
    {
      assert.equal('hello again', data.payload.text);
      done();
    });
    mockedUI.talk('Hey is there someone?');
  });

  it('should send a message from the agent to the UI', function(done)
  {
    console.log('Agent will send a message to the UI');
    mockedUI.socket.once('talkback', function(data)
    {
      // Received the response from the agent!
      assert.equal('Hello, I am your agent', data.payload.text);
      done();
    });
    mockedAgent.talk('Hello, I am your agent');
  });

  it('should make a session request to the livechat', function(done)
  {
    console.log('Agent will send a request to the livechat');
    mockedLiveChat.socket.once('sessionrequest', function()
    {
      done();
    });
    mockedUI.talk('livechat');
  });
});
