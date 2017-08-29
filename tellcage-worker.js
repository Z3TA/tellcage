
"use strict";

var telldus = require("telldus");

process.on('message', message);

process.send("Hello world!");

console.log("I'm alive!");

/*
setTimeout(function die() {
	throw new Error("crash boom bang!");
}, 3000);
*/

function message(msg) {
	
	if(msg.getDevices) {
		telldus.getDevices(function(err,devices) {
			process.send({answer: devices, err: err, id: msg.id});
			});
	}
	else if(msg.turnOn) {
		telldus.turnOn(msg.turnOn, function(err) {
			//console.log("Turned on " + msg.turnOn);
			process.send({answer: "turnOn", err: err, id: msg.id});
			
			//getStatus(msg.turnOn);
			
		});
	}
	else if(msg.turnOff) {
		telldus.turnOff(msg.turnOff, function(err) {
			//console.log("Turned off " + msg.turnOff);
			process.send({answer: "turnOff", err: err, id: msg.id});
			
			//getStatus(msg.turnOff);
		});
	}
	else if(msg.ping) {
		process.send({pong: msg.ping});
	}
	
}

function send(msg) {
	process.send(msg);
}

function getStatus(id) {
	// {"name":"Example device","id":1,"methods":["TURNON","TURNOFF"],"model":"codeswitch","protocol":"arctech","type":"DEVICE","status":{"name":"OFF"}}
	telldus.getDevices(function(err,devices) {
		if(err) console.log("Failed to get devices id=" + id);
		else {
			for(var i=0; i<devices.length; i++) {
			if(devices[i].id == id) {
				process.send({
					deviceEvent: {
						deviceId: id,
						status: devices[i].status
					}
				});
				return;
			}
		}
		}
		// If we did not return:
		console.log("Unknown device id=" + id);
		});
}

/*
	Cotchas:
	
	addRawDeviceEventListener gives wrong events, so we can not rely on it!
	
	When turning something on/off telldus gives a deviceEvent but not a rawDeviceEvent !
	
	We can probably reuse RawDeviceEvent for SensorEvent
	One less listener means fewer crashes
	
*/
var useRawForSensors = false;

var debugEventListener = telldus.addRawDeviceEventListener(debugEvent);
var deviceEventListener = telldus.addDeviceEventListener(deviceEvent);
if(!useRawForSensors) var sensorEventListener = telldus.addSensorEventListener(sensorEvent);


function deviceEvent(deviceId, status) {
	
	process.send({
		deviceEvent: {
			deviceId: deviceId,
			status: status
		}
	});
	
}

function sensorEvent(deviceId,protocol,model,type,value,timestamp) {
	
	process.send({
		sensorEvent: {
			deviceId: deviceId,
			protocol: protocol,
			model: model,
			type: type,
			value: value,
			timestamp: timestamp
		}
	});
	}


function debugEvent(controllerId, data) {
	/*
		
		class:command;protocol:arctech;model:selflearning;house:15274990;unit:10;group:0;method:turnon;
		class:command;protocol:sartano;model:codeswitch;code:0110011000;method:turnon;
		class:command;protocol:arctech;model:selflearning;house:15274990;unit:10;group:0;method:turnon;
		class:command;protocol:sartano;model:codeswitch;code:0110011000;method:turnon;"
		
		class:sensor;protocol:fineoffset;id:151;model:temperaturehumidity;humidity:99;temp:6.9;
		
	*/
	
	send({controllerId: controllerId, raw: data});
	
	
	
	// Serialize to json
	var arr = data.split(";");
	var obj = {};
	
	var part;
	for(var i=0; i<arr.length; i++) {
		part = arr[i].split(":");
		
		if(isNumeric(part[1])) part[1] = parseFloat(part[1]);
		
		obj[part[0]] = part[1];
	}
	
	if(obj.class == "sensor" && obj.id && useRawForSensors) {
		
		//RAW: class:sensor;protocol:fineoffset;id:199;model:temperaturehumidity;humidity:70;temp:5.7;
			
			//sensorEvent: deviceId=199, protocol=temperaturehumidity, model=fineoffset, type=1 value=5.7, timestamp=1478698883
			//sensorEvent: deviceId=199, protocol=temperaturehumidity, model=fineoffset, type=2 value=70, timestamp=1478698883
			
		var temperature = 1;
		var humidity = 2;
		
		if(obj.temp) {
			process.send({
				sensorEvent: {
					deviceId: obj.id,
					protocol: obj.model,
					model: obj.protocol,
					type: temperature,
					value: obj.temp,
					timestamp: Math.floor(new Date() / 1000)
				}
			});
		}
		
		if(obj.humidity) {
			process.send({
				sensorEvent: {
					deviceId: obj.id,
					protocol: obj.model,
					model: obj.protocol,
					type: humidity,
					value: obj.humidity,
					timestamp: Math.floor(new Date() / 1000)
				}
			});
		}
		
	}
	
	/*
	else if(obj.class == "command" && obj.unit) {
		// Timer to prevent doublets !?
		process.send({
			deviceEvent: {
				deviceId: obj.unit, 
				status: {name: obj.method == "turnon" ? "ON" : "OFF"}
			}
		});
		
	}
	
	*/
}

function isNumeric(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}