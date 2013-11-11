var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')
app.listen(8080);
io.set('log level', 1);
function handler (req, res) {
  var path = (req['url']=="/")?"/index.html":'/rot.min.js';
  fs.readFile(__dirname + path,
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading');
    }

    res.writeHead(200);
    res.end(data);
  });
}

var EventEmitter = require('events').EventEmitter;
var changeListener = new EventEmitter();
var outputListener = new EventEmitter();

var ROT = require("rot");

ROT.RNG.setSeed(12345);
ROT.DEFAULT_WIDTH = 80;
ROT.DEFAULT_HEIGHT = 30;

var entities = {};
var activeEntities = {};
var entitiesByLocation = [];
var inventories = {};
var playerKnowledge = {};

inventories.getOpenSlot = function(inv) {
    for(var i=0; i<inv.length; ++i) {
        if(inv[i] == undefined) { return i; }
    }
    return inv.length;
}

var genId;
(function() {
    var id = 0;
    genId = function() { return id++; }
})();

var mapData = [];

var utilities = require("utilities")(changeListener, outputListener, mapData, entities, activeEntities, entitiesByLocation, genId, playerKnowledge);

// import entity constructors
var construct = require("entity_objects")(utilities, changeListener, outputListener, entities, activeEntities, entitiesByLocation, mapData);
var creatures = require("entity_creatures")(utilities, changeListener, outputListener, entities, activeEntities, entitiesByLocation, mapData, construct);

// generate level 1 map
utilities.generateMapLevel(1);


for(var i=0; i<10; ++i) {
    var boulderpos = utilities.getValidPosition(1);
    new construct.Boulder({
        id: genId(),
        x: boulderpos.x,
        y: boulderpos.y,
        z: 1
    });

    var wandpos = utilities.getValidPosition(1);
    new construct.FreezeWand({
        id: genId(),
        x: wandpos.x,
        y: wandpos.y,
        z: 1
    });
    wandpos = utilities.getValidPosition(1);
    new construct.FireballWand({
        id: genId(),
        x: wandpos.x,
        y: wandpos.y,
        z: 1
    });

    var bugpos = utilities.getValidPosition(1);
    new creatures.GridBug({
        id: genId(),
        x: bugpos.x,
        y: bugpos.y,
        z: 1
    });
}

io.sockets.on('connection', function (socket) {

    var id = genId();

    playerKnowledge[id] = {
        map: [],
        entities: {}
    }

    var newPos = utilities.getValidPosition(1);
    new construct.Player({
        id: id,
        symbol: '@',
        color: colorFromId(id),
        x: newPos.x,
        y: newPos.y,
        z: 1,
        health: 10,
        socket: socket
    });

    inventories[id] = [];

    socket.emit('id', id);
    socket.emit('health', { value: 10 });

    socket.on('open', function(data) { setOpen(id, data, true); });
    socket.on('close', function(data) { setOpen(id, data, false); });

    function setOpen(id, data, doOpen) {
      var you = entities[id];
      var ents = utilities.getEntitiesByLocation(you.z, you.x + data.x, you.y + data.y, entities);
      openables = ents.filter(function (e) { return typeof e.isOpen != 'undefined'; });
      for (var i = 0; i < openables.length; i++) {
        if (openables[i].isOpen != doOpen) {
          var tmp = openables[i].symbol;
          openables[i].symbol = openables[i].otherSymbol;
          openables[i].otherSymbol = tmp;
        }
        openables[i].isOpen = doOpen;
        openables[i].blocking = !doOpen;
        openables[i].blocksLight = !doOpen;
      }
      changeListener.emit("change", [entities[id].z], ['pos', 'map']);
    }

    socket.on('move', function(data) { entities[id].step(data); });
    
    socket.on("zap", function(data) {
	    new construct.Pit({
	        id: genId(),
            knownTo: [id],
	        x: entities[id].x + (data.x * 4),
	        y: entities[id].y + (data.y * 4),
	        z: entities[id].z,
	    });
        changeListener.emit("change", [entities[id].z], ['pos']);
    });
    
    socket.on("mine", function(data) {
	    var myIds = [];
	    var counter = 0;
	    for(var i = -1; i <= 1; i++) {
	        for(var j = -1; j <= 1; j++) {
		        var mineId = genId();
		
		        myIds[counter] = mineId;
		        counter = counter + 1;

		        new construct.Mine({
		            id : mineId,
		            x: entities[id].x + i,
		            y: entities[id].y + j,
		            z: entities[id].z,
		            sisterMineIds: myIds
		        });
            }
	    }

    });

    socket.on("shoot", function(data) {
        var shotItem = inventories[id][data.itemNum];

        if(shotItem && shotItem.onFire) {
            shotItem.onFire(id, data);
        } else {
            //TODO: report failure to user
            //console.log("shot failed");
        }
    });

    socket.on("telepathy", function(data) {
        entities[id].psychic = data.active;

        changeListener.emit("change", [entities[id].z], ["pos"]);
    });

    socket.on("invisible", function(data) {
        entities[id].invisible = data.active;

        changeListener.emit("change", [entities[id].z], ["pos"]);
    });

    socket.on("pickup", function(data) {
        var you = entities[id];
        var ebl = entitiesByLocation;
        // get item at player location
        if(ebl[you.z] && ebl[you.z][you.x+","+you.y]) {
            // TODO: how to decide what to pick up?
            var pickups = ebl[you.z][you.x+","+you.y].filter(function(e) { return e.collectable; });
            for(var i=0; i<pickups.length; ++i) {
                var slot = inventories.getOpenSlot(inventories[id]);            
                inventories[id][slot] = pickups[i];
                pickups[i].remove();
                socket.emit("inventory", { change: "add", slot: slot, item: pickups[i] });
            }
            //console.log("pickup", inventories[id]);
        }

        changeListener.emit("change", [entities[id].z], ["pos"]);
    });

    socket.on("drop", function(data) {
        var you = entities[id];
        if(inventories[id][data.itemNum] != undefined) {
            inventories[id][data.itemNum].place(you.z, you.x, you.y);
            delete inventories[id][data.itemNum];
        }

        socket.emit("inventory", { change: "remove", slot: data.itemNum });

        changeListener.emit("change", [entities[id].z], ["pos"]);
    });

    // this should fire whenever a change happens to the world that may implicate a client redraw
    // this could be limited at least to level-specific activity, or even more localized
    function onChange(levels, types) {
        if(entities[id] == undefined) { return; }

        if(levels == undefined || levels.indexOf(entities[id].z) != -1) {
            if(types == undefined || (types.indexOf('pos') != -1 && types.indexOf('map') != -1)) {
                var mapDiff = utilities.diffMapForPlayer(id, utilities.filterMapData(id, mapData));
                socket.emit('map+pos', {
                                         'pos': utilities.diffEntitiesForPlayer(id,
                                                    utilities.copyEntitiesForClient(utilities.filterEntities(id, entities))
                                                ),
                                         'map': mapDiff
                                        });
                
            } else {
                if(types.indexOf('pos') != -1) { socket.emit('pos', utilities.diffEntitiesForPlayer(id,
                                                                        utilities.copyEntitiesForClient(utilities.filterEntities(id, entities))
                                                                    )); }
                if(types.indexOf('map') != -1) {
                    var mapDiff = utilities.diffMapForPlayer(id, utilities.filterMapData(id, mapData));
                    socket.emit('map', mapDiff);
                }
                if(types.indexOf('health') != -1) { socket.emit('health', { value: entities[id].health }); }
            }
        }
    }
    changeListener.on("change", onChange);
        
    // when leaving, remove the player entity and remove his change listener
    socket.on("disconnect", function() {
        var level = entities[id].z;
        entities[id].remove();
        changeListener.removeListener("change", onChange);
        delete playerKnowledge[id];
        changeListener.emit("change", [level], ['pos']);
    });
    
    changeListener.emit("change", [entities[id].z], ["pos", "map"]);

    outputListener.on("output", function(options) {
        if(options.targets == undefined || options.targets.indexOf(id) != -1) {
            socket.emit("output", options.message)
        }
    });
});

function colorFromId(id) {
    return ["#F00", "#0F0", "#00F", "#FF0", "#F0F", "#0FF"][id % 6];
}

// make active entities act (shots, monsters, time bombs, etc.)
var worldPeriod = 100;
setInterval(function() {
    for(var i in activeEntities) {
        var e = activeEntities[i];
        e.timeToNext -= worldPeriod;
        if(e.timeToNext <= 0) {
            e.timeToNext = e.intervalTime;
            e.act();
        }
    }
}, worldPeriod);

