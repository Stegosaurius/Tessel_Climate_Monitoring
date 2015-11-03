var Keen = require('keen.io');
var wifi = require('wifi-cc3000');
var climatelib = require('climate-si7020');
var ambientlib = require('ambient-attx4');
var keenConfigure = require('./keenConfigure.js');
var wifiSettings = require('./wifiConfigure.js');

var wifiNetwork = wifiSettings.ssid;
var wifiPassword = wifiSettings.password;
var wifiTimeoutTime = 0; //in seconds
var wifiSecurity  = 'wpa2';
var wifiTimeouts = 0;

var keen = Keen.configure(keenConfigure);
var tessel = require('tessel');
 
var climate = climatelib.use(tessel.port.A);
var ambient = ambientlib.use(tessel.port.D);

var THLSinterval = 60; //update interval for temperature, humidty, light and sound
var soundTriggerLevel = 0.2;
var lightTriggerLevel = 0.5;

var led1 = tessel.led[0].output(0);
var led2 = tessel.led[1].output(0); //led2 is on when wifi is on
 
//------------------------------------------------
// Climate Temp and Humidity
//------------------------------------------------

climate.on('ready', function () {
  console.log('Connected to si7020');
  ambient.on('ready', function () {
 
    // Loop forever
    setInterval(function () {
      led1.toggle();//toggle LEDs to know its running
      climate.readTemperature('f', function (err, temp) {
        climate.readHumidity(function (err, humid) {
          ambient.getLightLevel( function (err, light) {
            ambient.getSoundLevel( function (err, sound) {
              var date = new Date(Date.now());
              console.log("THLS event at : " + new Date(Date.now));
              console.log('Degrees:', temp.toFixed(4) + 'F', 'Humidity:', humid.toFixed(4) + '%RH');
              console.log("Light level:", light.toFixed(8), " ", "Sound Level:", sound.toFixed(8));
              if (wifi.isConnected()) {
                sendToCloud(temp, humid, light, sound, function(){
                  setTimeout(loop, 10000);
                });

              } else {
                console.log("wifi is not connected");
                setTimeout(loop, 10000);
              }
            });
          });
        });
      });
    }, THLSinterval*1000); //THLS interval is in seconds
  });
});
 
climate.on('error', function(err) {
  console.log('climate module error', err);
});

ambient.on('error', function (err) {
  console.log('ambient module error',err);
});

function sendToCloud(tdata, hdata, ldata, sdata, cb){
  keen.addEvent("climate", {  
   "temp": tdata,
   "humidity": hdata,
   "light": ldata,
   "sound": sdata
  }, function(){
    console.log("added THLS event");
    cb();
  });
}

//------------------------------------------------
//  Wifi logic 
//------------------------------------------------

wifi.on('connect', function(data){
  console.log("wifi connected:", data);
  led2 = tessel.led[1].output(1);
});

wifi.on('disconnect', function(data){
  // wifi dropped, probably want to call connect() again
  console.log("wifi disconnected:", data);
  led2 = tessel.led[1].output(0);
  wifiConnect();
});

wifi.on('timeout', function(err){
  console.log("wifi timeout (tried to connect but couldn't) emitted");
  wifiTimeouts++;
  if (wifiTimeouts > 2) {
    // reset the wifi chip if we've timed out too many times
    console.log('2 wifi timeouts have occured, running a wifi power cycle');
    wifiPowerCycle();
  } else {
    // try to reconnect
    wifiConnect();
  }
});

wifi.on('error', function(err){
  // one of the following happened
  // 1. tried to disconnect while not connected
  // 2. tried to disconnect while in the middle of trying to connect
  // 3. tried to initialize a connection without first waiting for a timeout or a disconnect
  console.log("wifi error emitted", err);
});

// reset the wifi chip progammatically
function wifiPowerCycle(){
  // when the wifi chip resets, it will automatically try to reconnect
  // to the last saved network
  wifi.reset(function(){
    wifiTimeouts = 0; // reset timeouts
    console.log("done power cycling wifi");
    // give it some time to auto reconnect
    setTimeout(function(){
      if (!wifi.isConnected()) {
        // try to reconnect
        wifiConnect();
      }
      }, 20 *1000); // 20 second wait
  });
}

function connectCallback(data) {
  console.log('reconnected to wifi', data);
}

function wifiConnect(){
  console.log('running wifiConnect');
  wifi.connect({
  security: wifiSecurity, 
  ssid: wifiNetwork,
  password: wifiPassword
  // , timeout: wifiTimeoutTime// in seconds
  }, connectCallback );
}

// connect wifi now, if not already connected
if (!wifi.isConnected()) {
  console.log('running initial wifiConnect');
  wifiConnect();
}else{
  led2 = tessel.led[1].output(1);
}