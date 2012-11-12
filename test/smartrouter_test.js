/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var assert = require('chai').assert;

var logger = require('../util/logger');

var smartrouter = require('../lib/smartrouter.js').instance;
var config = require('../config').local;
var Actor = require('../mockactors/actor');
var Agent = require('../mockactors/wbh').Agent;
var UI = require('../mockactors/ui').UI;
var LiveChat = require('../mockactors/livechat').LiveChat;


// MockActors
var mockedAgent;
var mockedUI;
var mockedLiveChat;

// /!\ Those tests need to have a local RabbitMQ running
describe('Smartrouter tests.', function()
{
  after(function(done)
        {
          smartrouter.stop();
          logger.info('smartrouter stopped');
          done();
        });

  it('should launch a smartrouter and send back \'started\'', function(done)
  {
    smartrouter.on('started', function () {
      logger.info('SmartRouter started');
      done();
    });

    smartrouter.start(config);
  });

  it('should connect an agent to the smartrouter', function(done)
  {
    console.log('starting agent test');
    mockedAgent = new Agent('localhost:8080', 'agent/456', '10.50.61.103');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedAgent.socket.on('hello', function()
    {
      done();
    });
    mockedAgent.setup();
  });

  it('sould connect an ui to the smartrouter', function(done)
  {
    console.log('starting ui test');
    mockedUI = new UI('localhost:8080', 'ui/456', '10.50.61.103');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedUI.socket.on('hello', function()
    {
      done();
    });
    mockedUI.setup();
  });

  it('sould connect a livechat to the smartrouter', function(done)
  {
    console.log('starting the livechat test');
    mockedLiveChat = new LiveChat('localhost:8080', 'livechat/456', 'server1');
    // If we receive the hello callback, it means that we have correctly handshaked
    // and that the smartrouter has accepted us
    mockedLiveChat.socket.on('hello', function()
    {
      done();
    });
    mockedLiveChat.setup();
  });

  it('should send a message from the ui to the agent', function(done)
  {
    console.log('UI will send a message to the agent');
    mockedAgent.socket.on('talk', function(data)
    {
      // Message has correctly been routed by the smartrouter!
      assert.equal('Hey is there someone?', data.payload.text);
    });
    // Mocked Agent is set to send back a 'hello again' message. Wait for it to finish the test
    mockedUI.socket.on('talkback', function(data)
    {
      assert.equal('hello again', data.payload.text);
      done();
    });
    mockedUI.talk('Hey is there someone?');
  });

//  it('should send a message from the agent to the UI', function(done)
//  {
//    console.log('Agent will send a message to the UI');
//    mockedUI.socket.on('talkback', function(data)
//    {
//      // Received the response from the agent!
//      assert.equal('Hello, I am your agent', data.payload.text);
//      done();
//    });
//    mockedAgent.talk('Hello, I am your agent');
//  });
});