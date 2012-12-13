/*
 * Copyright 2012 VirtuOz Inc. All rights reserved.
 */

var LiveChat = require('../mockactors/livechat').LiveChat;

var livechat = new LiveChat('http://localhost:8080', 'livechat/456', 'server1');
livechat.connect();
