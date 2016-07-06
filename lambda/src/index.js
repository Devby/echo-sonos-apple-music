'use strict';

var http = require('http');
var https = require('https');

// If you setup basic auth in node-sonos-http-api's settings.json, change the username
// and password here.  Otherwise, just leave this alone and it will work without auth.

var auth = new Buffer("MAKE_UP_A_USERNAME" + ":" + "MAKE_UP_A_PASSWORD").toString("base64");

var options = {
  appid: "YOUR_ALEXA_APP_ID",
  host: "YOUR_HOME_SERVER_HOST_OR_IP-MAYBE-USE-DDNS",
  port: "5006",
  headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json'
  },
  useHttps: true,
  rejectUnauthorized: false
};

var AlexaSkill = function(appId) {
    this._appId = appId;
};

AlexaSkill.speechOutputType = {
    PLAIN_TEXT: 'PlainText',
    SSML: 'SSML'
};

AlexaSkill.prototype.requestHandlers = {
    LaunchRequest: function (event, context, response) {
        this.eventHandlers.onLaunch.call(this, event.request, event.session, response);
    },

    IntentRequest: function (event, context, response) {
        this.eventHandlers.onIntent.call(this, event.request, event.session, response);
    },

    SessionEndedRequest: function (event, context) {
        this.eventHandlers.onSessionEnded(event.request, event.session);
        context.succeed();
    }
};

/**
 * Override any of the eventHandlers as needed
 */
AlexaSkill.prototype.eventHandlers = {
    /**
     * Called when the session starts.
     * Subclasses could have overriden this function to open any necessary resources.
     */
    onSessionStarted: function (sessionStartedRequest, session) {
    },

    /**
     * Called when the user invokes the skill without specifying what they want.
     * The subclass must override this function and provide feedback to the user.
     */
    onLaunch: function (launchRequest, session, response) {
        //really only called when the user does not specify an intent
        response.ask("What should I tell the Sonos to do?");
    },

    /**
     * Called when the user specifies an intent.
     */
    onIntent: function (intentRequest, session, response) {
        var intent = intentRequest.intent,
            intentName = intentRequest.intent.name,
            intentHandler = this.intentHandlers[intentName];
        if (intentHandler) {
            console.log('dispatch intent = ' + intentName);
            intentHandler.call(this, intent, session, response);
        } else {
            throw 'Unsupported intent = ' + intentName;
        }
    },

    /**
     * Called when the user ends the session.
     * Subclasses could have overriden this function to close any open resources.
     */
    onSessionEnded: function (sessionEndedRequest, session) {
    }
};

/**
 * Subclasses should override the intentHandlers with the functions to handle specific intents.
 */
AlexaSkill.prototype.intentHandlers = {};

AlexaSkill.prototype.execute = function (event, context) {
    try {
        console.log("session applicationId: " + event.session.application.applicationId);

        // Validate that this request originated from authorized source.
        if (this._appId && event.session.application.applicationId !== this._appId) {
            console.log("The applicationIds don't match : " + event.session.application.applicationId + " and "
                + this._appId);
            throw "Invalid applicationId";
        }

        if (!event.session.attributes) {
            event.session.attributes = {};
        }

        if (event.session.new) {
            this.eventHandlers.onSessionStarted(event.request, event.session);
        }

        // Route the request to the proper handler which may have been overriden.
        var requestHandler = this.requestHandlers[event.request.type];
        requestHandler.call(this, event, context, new Response(context, event.session));
    } catch (e) {
        console.log("Unexpected exception " + e);
        context.fail(e);
    }
};

var Response = function (context, session) {
    this._context = context;
    this._session = session;
};

function createSpeechObject(optionsParam) {
    if (optionsParam && optionsParam.type === 'SSML') {
        return {
            type: optionsParam.type,
            ssml: optionsParam.speech
        };
    } else {
        return {
            type: optionsParam.type || 'PlainText',
            text: optionsParam.speech || optionsParam
        };
    }
}

Response.prototype = (function () {
    var buildSpeechletResponse = function (options) {
        var alexaResponse = {
            outputSpeech: createSpeechObject(options.output),
            shouldEndSession: options.shouldEndSession
        };
        if (options.reprompt) {
            alexaResponse.reprompt = {
                outputSpeech: createSpeechObject(options.reprompt)
            };
        }
        if (options.cardTitle && options.cardContent) {
            alexaResponse.card = {
                type: "Simple",
                title: options.cardTitle,
                content: options.cardContent
            };
        }
        var returnResult = {
                version: '1.0',
                response: alexaResponse
        };
        if (options.session && options.session.attributes) {
            returnResult.sessionAttributes = options.session.attributes;
        }
        return returnResult;
    };

    return {
        tell: function (speechOutput) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                shouldEndSession: true
            }));
        },
        tellWithCard: function (speechOutput, cardTitle, cardContent) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                cardTitle: cardTitle,
                cardContent: cardContent,
                shouldEndSession: true
            }));
        },
        ask: function (speechOutput, repromptSpeech) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                reprompt: repromptSpeech,
                shouldEndSession: false
            }));
        },
        askWithCard: function (speechOutput, repromptSpeech, cardTitle, cardContent) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                reprompt: repromptSpeech,
                cardTitle: cardTitle,
                cardContent: cardContent,
                shouldEndSession: false
            }));
        }
    };
})();

var EchoSonos = function () {
    AlexaSkill.call(this, options.appid);
};

var STATE_RESPONSES = [
    "This is $currentTitle by $currentArtist",
    "We're listening to $currentTitle by $currentArtist",
    "$currentTitle by $currentArtist"
];

EchoSonos.prototype = Object.create(AlexaSkill.prototype);
EchoSonos.prototype.constructor = EchoSonos;

EchoSonos.prototype.intentHandlers = {
    // register custom intent handlers
    PlayIntent: function (intent, session, response) {  
	    console.log("Play Intent received for channel " + intent.slots.Channel.value + " in room " + intent.slots.Room.value);
        playlistHandler(intent.slots.Room.value, intent.slots.Channel.value, '/applemusic/queue/name:', response);
    },
    
    RadioIntent: function (intent, session, response) {  
	    console.log("Radio Intent received for channel " + intent.slots.Channel.value + " in room " + intent.slots.Room.value);
        playlistHandler(intent.slots.Room.value, intent.slots.Channel.value, '/applemusic/radio/radio:', response);
    },

    ResumeAllIntent: function (intent, session, response) {
        console.log("ResumeAllIntent received");
        options.path = '/resumeall';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },

    ResumeIntent: function (intent, session, response) {
        console.log("ResumeIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/play';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },
    
    PauseAllIntent: function (intent, session, response) {
        console.log("PauseAllIntent received");
        options.path = '/pauseall';
        httpreq(options, function(error) {
            genericResponse(error, response, 'Done.');
        });
    },

    PauseIntent: function (intent, session, response) {
        console.log("PauseIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/pause';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },

    VolumeDownIntent: function (intent, session, response) {
        console.log("VolumeDownIntent received");
        volumeHandler(intent.slots.Room.value, response, '-10');
    },

    VolumeUpIntent: function (intent, session, response) {
        console.log("VolumeUpIntent received");
        volumeHandler(intent.slots.Room.value, response, '+10');
    },

    SetVolumeIntent: function (intent, session, response) {
        console.log("SetVolumeIntent received");
        volumeHandler(intent.slots.Room.value, response, intent.slots.Percent.value);
    },

    NextTrackIntent: function (intent, session, response) {
        console.log("NextTrackIntent received");

        actOnCoordinator(options, '/next', intent.slots.Room.value,  function (error, responseBodyJson) {
            genericResponse(error, response);
        });
    },

    PreviousTrackIntent: function (intent, session, response) {
        console.log("PreviousTrackIntent received");
        actOnCoordinator(options, '/previous', intent.slots.Room.value,  function (error, responseBodyJson) {
            genericResponse(error, response);
        });
    },

    WhatsPlayingIntent: function (intent, session, response) {
        console.log("WhatsPlayingIntent received");
        if (typeof intent.slots.Room.value === 'undefined'){
		    response.tell("If you'd like to know what is playing you will need to specify a room when you ask me that question.");
		    return;	
	    } else {
	        console.log('Room value is of type: ' + typeof intent.slots.Room.value);
	    }
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/state';
        httpreq(options, function (error, responseJson) {
            if (!error) {
                responseJson = JSON.parse(responseJson);
                var randResponse = Math.floor(Math.random() * STATE_RESPONSES.length);
                var responseText = STATE_RESPONSES[randResponse].replace("$currentTitle", responseJson.currentTrack.title).replace("$currentArtist", responseJson.currentTrack.artist);
                response.tell(responseText);
            }
            else { 
                response.tell(error.message);
            }
        });
    },

    MuteIntent: function (intent, session, response) {
        console.log("MuteIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/mute';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },

    UnmuteIntent: function (intent, session, response) {
        console.log("UnmuteIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/unmute';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },

    ClearQueueIntent: function (intent, session, response) {
        console.log("ClearQueueIntent received");
        actOnCoordinator(options, '/clearqueue', intent.slots.Room.value,  function (error, responseBodyJson) {
            genericResponse(error, response);
        });
    },

    RepeatIntent: function (intent, session, response) {
        console.log("RepeatIntent received");
        toggleHandler(intent.slots.Room.value, intent.slots.Toggle.value, "repeat", response);
    },

    ShuffleIntent: function (intent, session, response) {
        console.log("ShuffleIntent received");
        toggleHandler(intent.slots.Room.value, intent.slots.Toggle.value, "shuffle", response);
    },

    CrossfadeIntent: function (intent, session, response) {
        console.log("CrossfadeIntent received");
        toggleHandler(intent.slots.Room.value, intent.slots.Toggle.value, "crossfade", response);
    },
    
    UngroupIntent: function (intent, session, response) {
        console.log("UngroupIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.Room.value) + '/isolate';
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    },
   
    JoinGroupIntent: function (intent, session, response) {
        console.log("JoinGroupIntent received");
        options.path = '/' + encodeURIComponent(intent.slots.JoiningRoom.value) + '/join/' 
                + encodeURIComponent(intent.slots.PlayingRoom.value);
        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    }
};

/** Handles playlists and favorites */
function playlistHandler(roomValue, presetValue, skillName, response) {
    var skillPath = skillName + encodeURIComponent(presetValue.toLowerCase());
    
    // This first action queues up the playlist / favorite, and it shouldn't say anything unless there's an error
    actOnCoordinator(options, skillPath, roomValue, function(error, responseBodyJson) {
        if (error) {
            genericResponse(error, response);
        } else {
            // The 2nd action actually plays the playlist / favorite - sometimes this starts before the sonos has queued up the new music though so lets wait a moment
            setTimeout(function() {
                actOnCoordinator(options, '/play', roomValue, function(error, responseBodyJson) {
                    if(skillName === '/applemusic/radio/radio:'){
                        genericResponse(error, response, "Starting a " + presetValue + " radio station.");
                    } else {
                        genericResponse(error, response, "Starting " + presetValue);
                    }
                });
            }, 1000);
        }
    });
}

/** Handles all skills of the form /roomname/toggle/[on,off] */
function toggleHandler(roomValue, toggleValue, skillName, response) {
    if (!toggleValue || (toggleValue != 'on' && toggleValue != 'off')) {
        response.tell("I need to know if I should turn  " + skillName + " on or off. Example: Alexa, tell Sonos to turn " + skillName + " on");
        return;
    }

    options.path = '/' + encodeURIComponent(roomValue) + '/' + skillName + '/' + toggleValue;

    httpreq(options, function(error) {
        if (!error) {
            response.tell("Turned " + skillName + " " + toggleValue + " in " + roomValue);
        }
        else { 
          response.tell(error.message);
        }
    });
}

/** Handles up, down, & absolute volume for either an individual room or an entire group */
function volumeHandler(roomValue, response, volume) {
    var roomAndGroup = parseRoomAndGroup(roomValue);

    if (!roomAndGroup.room) {
        response.tell("Please specify a room. For example, turn the volume down in the KITCHEN");
        return;
    }

    if (!roomAndGroup.group) {
        options.path = '/' + encodeURIComponent(roomAndGroup.room) + '/volume/' + volume;

        httpreq(options, function(error) {
            genericResponse(error, response);
        });
    }

    else {
        actOnCoordinator(options, '/groupVolume/' + volume, roomAndGroup.room,  function (error, responseBodyJson) {
            genericResponse(error, response);
        });
    }
}

/* Given a string roomArgument that either looks like "my room" or "my room group",
 * returns an object with two members:
 *   obj.group: true if roomArgument ends with "group", false otherwise.
 *   obj.room: if roomArgument is "my room group", returns "my room"
 */
function parseRoomAndGroup(roomArgument) {
    var roomAndGroupParsed = new Object();
    roomAndGroupParsed.group = false;
    roomAndGroupParsed.room = false;

    if (!roomArgument) {
        return roomAndGroupParsed;
    }

    var groupIndex = roomArgument.indexOf("group");

    if (groupIndex && (groupIndex + 4 == (roomArgument.length - 1)) && roomArgument.length >= 7) {
        roomAndGroupParsed.group = true;
        roomAndGroupParsed.room = roomArgument.substr(0, groupIndex - 1);
    }
    else {
        roomAndGroupParsed.room = roomArgument;
    }

    return roomAndGroupParsed;
}

function httpreq(options, responseCallback) {
    var transport = options.useHttps ? https : http;
    
    console.log("Sending " + (options.useHttps ? "HTTPS" : "HTTP" ) + " request to: " + options.path);
  
    var req = transport.request(options, function(httpResponse) {
        var body = '';
        
        httpResponse.on('data', function(data) {
            body += data;
        });
        
        httpResponse.on('end', function() {
            responseCallback(undefined, body);
        });
    });

    req.on('error', function(e) {
        responseCallback(e);
    });

    req.end();
}

// 1) grab /zones and find the coordinator for the room being asked for
// 2) perform an action on that coordinator 
function actOnCoordinator(options, actionPath, room, onCompleteFun) {
    options.path = '/zones';
    console.log("getting zones...");

    var handleZonesResponse = function (error, responseJson) {
        if (!error) { 
            responseJson = JSON.parse(responseJson);
            var coordinatorRoomName = findCoordinatorForRoom(responseJson, room);
            options.path = '/' + encodeURIComponent(coordinatorRoomName) + actionPath;
            console.log('actOnCoordinator requesting path ' + options.path);
            httpreq(options, onCompleteFun);
        }
        else { 
            onCompleteFun(error);
        }
    };

    httpreq(options, handleZonesResponse);
}

function genericResponse(error, response, success) {
    if (!error) {
        if (!success) {
            response.tell("OK");
        }
        else {
            response.tell(success);
        }
    }
    else {
        response.tell("The Lambda service encountered an error.");
    }
}

// Given a room name, returns the name of the coordinator for that room
function findCoordinatorForRoom(responseJson, room) {
    console.log("finding coordinator for room: " + room);
    
    for (var i = 0; i < responseJson.length; i++) {
        var zone = responseJson[i];

        for (var j = 0; j < zone.members.length; j++) {
            var member = zone.members[j];

            if (member.roomName.toLowerCase() == room.toLowerCase()) {
                return zone.coordinator.roomName;
            }
        }
    }
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the EchoSonos skill.
    var echoSonos = new EchoSonos();
    echoSonos.execute(event, context);
};
