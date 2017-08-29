
var telldus = require("./tellcage.js");

telldus.getDevices(function(err,device) {
	if(err) throw err;
	log("Got devices!");
	afterDevices();
});

var debugEventListener = telldus.addRawDeviceEventListener(debugEvent);
var deviceEventListener = telldus.addDeviceEventListener(deviceEvent);
var sensorEventListener = telldus.addSensorEventListener(sensorEvent);

function afterDevices() {
	
	telldus.turnOn(31,function(err) {
		if(err) throw err;
		
		log("I turned something ON");
	});
	
	setTimeout(function turnItOff() {
		telldus.turnOff(31,function(err) {
			if(err) throw err;
			
			log("I turned something OFF");
		});
	}, 2000);
}

function debugEvent(controllerId, data) {
	log("debug: RAW: " + data);
	// debug: RAW: class:sensor;protocol:fineoffset;id:199;model:temperaturehumidity;humidity:70;temp:5.7;
	
}

function deviceEvent(deviceId, status) {
	log("debug: deviceEvent: Device " + deviceId + " is now " + status.name);
	// debug: deviceEvent: Device 32 is now OFF
}

function sensorEvent(deviceId,protocol,model,type,value,timestamp) {
	log("debug: sensorEvent: deviceId=" + deviceId + ", protocol=" + protocol + ", model=" + model + ", type=" + type + " value=" + value + ", timestamp=" + timestamp);
	// debug: sensorEvent: deviceId=183, protocol=temperaturehumidity, model=fineoffset, type=1 value=20.5, timestamp=1478698868
}

function log(msg) {
	console.log(msg);
}
