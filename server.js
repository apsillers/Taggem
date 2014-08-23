var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
<<<<<<< HEAD
  , fs = require('fs');

app.listen(process.env.OPENSHIFT_NODEJS_PORT || 8080, process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
io.set('log level', 1);
function handler (req, res) {
  var path = (req['url']=="/")?"/index.html":'/rot.min.js';
  fs.readFile(__dirname + path,
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading');
    }

    res.setHeader("content-type", "text/html");
    res.writeHead(200);
    res.end(data);
  });
=======
  , fs = require('fs')
app.listen(process.argv[2] || 8080);
io.set('log level', 1);
function handler (req, res) {
    var path;
    var allowedURLs = ["/index.html", "/gm.html", "/rot.min.js"];
    if(allowedURLs.indexOf(req.url)) { path = req.url; }
    if(req.url == "/") { path = "/index.html"; }

    fs.readFile(__dirname + path,
		function (err, data) {
		    if (err) {
			res.writeHead(500);
			return res.end('Error loading');
		    }
		    
		    res.writeHead(200);
		    res.end(data);
		});
>>>>>>> master
}

var ROT = require("rot");

ROT.DEFAULT_WIDTH = 80;
ROT.DEFAULT_HEIGHT = 30;

var state = require("./state");
var listeners = require("./listeners");

var utilities = require("./utilities");

// import entity constructors
var construct = require("./objects/entity_objects");
var creatures = require("./monsters/entity_creatures");

// generate level 1 map
utilities.generateMapLevel(1);

io.sockets.on('connection', function(socket) {
    socket.on("player", function() { require("./player_init")(socket) });
    socket.on("gm", function() { require("./gm_init")(socket) });
});

// make active entities act (shots, monsters, time bombs, etc.)
var worldPeriod = 200;
setInterval(function() {
    for(var i in state.activeEntities) {
        var e = state.activeEntities[i];
        e.timeToNext -= worldPeriod;
        if(e.timeToNext <= 0) {
            e.timeToNext = Math.max(0, e.intervalTime + e.timeToNext);
            if(e.act) { e.act(); }
        }
    }
}, worldPeriod);
