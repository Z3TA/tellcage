/*
	Wraps/Encapsulates and fully abstracts the telldus module ... It can be used as a replacement for the telldus module
	
	The telldus module can only have one something-listener or it will crash with segfault, it can also randomly hang
	
	This module spawns a worker, that is pinged and can be restarted without affecting your main daemon
	
	Note: The telldus module can suddenly stop reciving events, you need to check for that in your script.
	for example: if(new Date() - lastEvent > eventProblemMs) throw new Error("No event recived for " + eventProblemMs/1000 +" seconds")
	
	
	
	Tips:
	
	Place magnets close together so that they do not glitch.
	
	
*/

"use strict";

var debug = true;
var fork = require('child_process').fork;
var scriptPath = __dirname + "/tellcage-worker.js";
var respawnTimer, resetRestartsTimer;
var restarts = 0;
var maxRestartsPerMinute = 6;
var arg = [];
var opt = {silent: true}; // silent: true allows stdin, stdout, and stderr
var worker;
var CB_ID = 0;
var PING_ID = 0;
var question = {}; // Store callbacks
var pingInterval = 2000;
var pings = [];
var maxPingLost = 2;
var respawnTime = 257; // How long time given to gracefully shutdown
var sensorEventListeners = [];
var deviceEventListeners = [];
var rawDeviceEventListeners = [];
var firstSpawn = true;
var updateStateOnRespawn = false;

respawn();

setInterval(ping, pingInterval);

function ping() {
	
	if(pings.length > maxPingLost) {
		close(worker);
		
		// Note: if we get an exit event, it will also be respawned
		respawnTimer = setTimeout(respawn, respawnTime);
		
		pings.length = 0;
		
	}
	else {
		
		var id = ++PING_ID;
		pings.push(id);
		send({ping: id});
	}
}

module.exports.turnOn = function turnOn(deviceId, callback) {
	//log("Turning ON " + deviceId + "...");
	var id = ++CB_ID;
	question[id] = callback;
	send({turnOn: deviceId, id: id});
}

module.exports.turnOff = function turnOff(deviceId, callback) {
	//log("Turning OFF " + deviceId + "...");
	var id = ++CB_ID;
	question[id] = callback;
	send({turnOff: deviceId, id: id});
}

module.exports.removeEventListener = removeEventListener;

function removeEventListener(fun) {
	// Remove any event listener !?
	
	for(var i=0; i<rawDeviceEventListeners.length; i++) {
		if(rawDeviceEventListeners[i] == fun) {
			rawDeviceEventListeners.splice(i, 1);
			return removeEventListener(fun);
		}
	}
	
	for(var i=0; i<sensorEventListeners.length; i++) {
		if(sensorEventListeners[i] == fun) {
			sensorEventListeners.splice(i, 1);
			return removeEventListener(fun);
		}
	}
	
	for(var i=0; i<deviceEventListeners.length; i++) {
		if(deviceEventListeners[i] == fun) {
			deviceEventListeners.splice(i, 1);
			return removeEventListener(fun);
		}
	}
	
}

module.exports.addRawDeviceEventListener = function addRawDeviceEventListener(fun) {
	rawDeviceEventListeners.push(fun);
}

module.exports.addDeviceEventListener = function addDeviceEventListener(fun) {
	deviceEventListeners.push(fun);
}

module.exports.addSensorEventListener = function addSensorEventListener(fun) {
	sensorEventListeners.push(fun);
}

module.exports.getDevices = getDevices;

function getDevices(callback) {
	var id = ++CB_ID;
	question[id] = callback;
	send({getDevices: "all", id: id});
}

function send(msg) {
	if(worker) {
		if(worker.connected) worker.send(msg);
		else log("Worker not connected! Unable to send: " + JSON.stringify(msg));
	}
	else {
		log("Worker not available! Unable to send: " + JSON.stringify(msg));
	}
}



function message(msg) {
	
	//log("MSG: " + JSON.stringify(msg));
	
	if(msg.answer) {
		if(question.hasOwnProperty(msg.id)) {
			question[msg.id](msg.err, msg.answer);
			delete question[msg.id];
		}
	}
	else if(msg.sensorEvent) {
		sensorEventListeners.forEach(function(cb) {
			cb(msg.sensorEvent.deviceId, msg.sensorEvent.protocol, msg.sensorEvent.model, msg.sensorEvent.type, msg.sensorEvent.value, msg.sensorEvent.timestamp);
		});
	}
	else if(msg.deviceEvent) {
		deviceEventListeners.forEach(function(cb) {
			cb(msg.deviceEvent.deviceId, msg.deviceEvent.status);
		});
	}
	else if(msg.raw) {
		rawDeviceEventListeners.forEach(function(cb) {
			cb(msg.controllerId, msg.raw);
		});
	}
	else if(msg.pong) {
		if(pings.indexOf(msg.pong) == -1) throw new Error("Got bad pong=" + msg.pong + " pings=" + JSON.stringify(pings));
		pings.splice(pings.indexOf(msg.pong), 1);
	}
	else {
		log("UNKNOWN: " + JSON.stringify(msg, null, 2)); 
	}
	
}

function stdout(data) {
	log("worker-stdout: " +  data);
	
}

function stderr(data) {
	log("worker-stderr: " + data);
}

function respawn() {
	
	if(worker) {
		// Make sure the old one is really really dead
		worker.kill('SIGKILL');
		if(worker.connected) worker.disconnect();
	}
	
	log("Starting: " + scriptPath, 7);
	
	worker = fork(scriptPath, arg, opt);
	
	
	// Attach event listeners
	
	worker.stdout.on('data', stdout);
	worker.stderr.on('data', stderr);
	worker.on('close', closeStdioStreams);
	worker.on('exit', processEnded);
	worker.on('message', message);
	
	if(!firstSpawn && updateStateOnRespawn) {
		// We could have missed a bunch of events during the downtime, 
		// call getDevices and update device listeners so that they get the current state
		getDevices(function state(err, devices) {
			if(err) {
				log("Failed to get devices after respawning telldus.");
				throw err;
			}
			
			deviceEventListeners.forEach(function updateDeviceEventListeners(cb) {
				for(var i=0; i<devices.length; i++) cb(devices[i].id, devices[i].status);
			});
			
		});
	}
	firstSpawn = false;
	
}

function closeStdioStreams(code, signal) {
	log("Worker closed stdio streams! code=" + code + " signal=" + signal);
}

function processEnded(code, signal) {
	var finalExit = (code !== null);
	
	log("Worker ended! code=" + code + " signal=" + signal + " finalExit=" + finalExit);
	
	// NodeJS errors will have a code, but if the process is killed via a signal, we wont get a final exit
	// So always restart!
	
	if(!finalExit) close(worker); // Make sure it's really dead, and disconnect from it
	// (but do not send SIGKILL because we want to give it a chance to gracefully shut down)
	
	exit(code, signal);
	
}

function exit(code, signal) {
	
	var waitForRespawn = 2000;
	
	log("Waiting " + waitForRespawn + "ms to restart: " + scriptPath, 7);
	
	var oneMinute = 60000;
	if(restarts > maxRestartsPerMinute) throw new Error("restarts=" + restarts + " > maxRestartsPerMinute=" + maxRestartsPerMinute + " ");
	
	clearTimeout(resetRestartsTimer);
	clearTimeout(respawnTimer);
	
	respawnTimer = setTimeout(function() {
		
		restarts++;
		
		respawn();
		
		resetRestartsTimer = setTimeout(function() {
			// Reset the restarts counter if the worker has been running for more then 60 seconds ...
			restarts = 0;
		}, oneMinute);
		
	}, waitForRespawn);
	
}

function close(worker) {
	// Allow the process to gracefully shut down
	
	worker.kill('SIGTERM');
	worker.kill('SIGINT');
	worker.kill('SIGQUIT');
	worker.kill('SIGHUP');
	
	if(worker.connected) worker.disconnect();
}

function log(msg) {
	if(debug) console.log(myDate() + ": TELLCAGE-DEBUG: " + msg);
	
	function myDate() {
		var d = new Date();
		
		var hour = addZero(d.getHours());
		var minute = addZero(d.getMinutes());
		var second = addZero(d.getSeconds());
		
		var day = addZero(d.getDate());
		var month = addZero(1+d.getMonth());
		var year = d.getFullYear();
		
		return year + "-" + month + "-" + day + " (" + hour + ":" + minute + ":" + second + "_" + d.getMilliseconds() + ")";
		
		function addZero(n) {
			if(n < 10) return "0" + n;
			else return n;
		}
	}
	
}



