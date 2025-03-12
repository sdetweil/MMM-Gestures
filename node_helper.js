"use strict";

/*
 * Node.js application used to collect events from Arduino via serial USB port
 * - gesture and presence events are forwarded to web view via websockets
 * - power saving mode to turn off display if no gesture was received for 5 minutes
 *
 * By Thomas Bachmann (https://github.com/thobach)
 *
 * License: MIT
 *
 */

// retrieving gesture and distance events from Arduino happens via serial port (USB)
var NodeHelper = require("node_helper");
const { ReadlineParser } = require('@serialport/parser-readline')
const { SerialPort } = require('serialport')

module.exports = NodeHelper.create({
	socketIOPath: "m" + this.name,
	socket: null,
	config: null,
	start: function () {

		// by default assuming monitor is on
		this.hdmiOn = true;

		// handler for timeout function, used to clear timer when display goes off
		this.turnOffTimer = undefined;

		// put monitor to sleep after 5 minutes without gesture or distance events
		this.WAIT_UNTIL_SLEEP = 1 * 60 * 1000;
 
	},

	// broadcast text messages to all subscribers (open web views)
	broadcast: function (str) {
		console.log(new Date() + ':  RECEIVED_GESTURE ' + str);
		switch (this.config.role) {
			case 'server':
			case 'none':
				console.log("sending data up to module=" + str)
				this.sendSocketNotification("RETRIEVED_GESTURE", str);
				break;
			case 'remote':
				console.log("sending data to server module" + str)
				this.socket.emit("gesture", str)
		}
	},		

	socketNotificationReceived(notification, payload) {
		if (notification === 'config') {
			this.config = payload
			if (this.config.role === 'server')
				this.setupSocketio()
			else {
				this.init()
				if (role === 'remote') {
					this.setupSocketio()
					this.connectSocket(this.config.sever)
				}
			}
		}
	  
	},
	
	setupSocketio() {
		this.io.of(this.socketIOPath).on("connection", (socket) => {
			this.handleConnection(socket, "connect");
		});
		this.io.of(this.socketIOPath).on("disconnect", () => {
			if (debug)
				console.log("socket disconnected");
		});		
	},


	handleConnection(socket, type) {
		if (debug) console.log("connection started = " + type);
		//console.log("socket connected")
		//socket.emit("connected");
		if (this.config.role === 'server') {
			if (type === 'connect') {
				socket.on("gesture", (data) => {
					console.log("received getsture message from remote=" + data)
					this.broadcast(data)
				});
			}
		} else if (this.config.role === 'remote') {
			this.socket = socket
		}		
	},

	connectSocket(server) {
		this.io.connectSocket()
	},

  // turn display on or off
  saveEnergy: function(person) {

    var self = this;

    console.log(new Date() + ': saveEnergy() called with person: ' + person + ', in state hdmiOn: ' + self.hdmiOn + ', turnOffTimer:' + self.turnOffTimer);

  	// deactivate timeout handler if present
  	if(self.turnOffTimer){
  	console.log(new Date() + ': removing save energy timer');
  		clearTimeout(self.turnOffTimer);
  	}

  	// turn on display if off and person is present in front of mirror
  	if(person == "PRESENT" && !self.hdmiOn){

  	console.log(new Date() + ': turn on display again');

  		// make system call to power on display
  		var exec = require('child_process').exec;
  		// alternatively could usee also "tvservice -p", but showed less compatability
  		exec(this.config.power_on_command, function(error, stdout, stderr) {
  			if (error !== null) {
  				console.log(new Date() + ': exec error: ' + error);
  			} else {
  				process.stdout.write(new Date() + ': Turned monitor on.\n');
  				self.hdmiOn = true;
  			}
  		});

  	}
  	// activate timer to turn off display if display is on and person is away for a while
  	else if(person == "AWAY" && self.hdmiOn) {

  		console.log(new Date() + ': set timer to turn off display in '+self.WAIT_UNTIL_SLEEP+'s');

  		// activate time to turn off display
  		self.turnOffTimer = setTimeout(function(){

  			// make system call to turn off display
  			var exec = require('child_process').exec;
  			// alternatively could usee also "tvservice -o", but showed less compatability
  			exec(this.config.power_off_command, function(error, stdout, stderr) {
  				if (error !== null) {
  					console.log(new Date() + ': exec error: ' + error);
  				} else {
  					process.stdout.write(new Date() + ': Turned monitor off.\n');
  					self.hdmiOn = false;
  				}
  			});

  		}, self.WAIT_UNTIL_SLEEP);

  	}

  },

  // init node.js app
  init: function() {

  	// make system call to get device where Arduino is connected (e.g. /dev/ttyACM0 or /dev/ttyUSB0)
  	// can vary depending on which USB port the Arduino is connected
  	var exec = require('child_process').exec;
  	var self = this;
  	exec('ls /dev/ttyACM*', function(error, stdout, stderr) {

  		if (error !== null) {

  			console.log(new Date() + ': exec error: ' + error);

  		} else {

  			// extract device information (which USB port)
  			var usbDev = stdout.replace("\n","");
  			process.stdout.write(new Date() + ': Using USB: ' + usbDev + '.\n');

  			// create serial port for connected Arduino
  			const serialPort = new SerialPort({ path: usbDev, baudRate: 9600 });
  			const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

  			// list to events from Arduino via serial USB port (e.g. from /dev/ttyACM0)

  			console.log('serial port opened');

  			parser.on('data', function(data) {

  				// parse Arduino distance events (distance sensor)
  				if(data.indexOf("Person: ") == 0){

  					console.log(data);

  					var person = data.replace("Person: ","");
  					// remove ending newline
  					person = person.replace(/(\r\n|\n|\r)/gm,"");

  					self.broadcast(person);

  					self.saveEnergy(person);

  				}
  				// parse Arduino gesture events (gesture sensor)
  				else if(data.indexOf("Gesture: ") == 0){

  					console.log(data);

  					var gesture = data.replace("Gesture: ","");
  					// remove ending newline
  					gesture = gesture.replace(/(\r\n|\n|\r)/gm,"");

  					self.broadcast(gesture);

  				}

  			});

  		}
  	});

  },
});
