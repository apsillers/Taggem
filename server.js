var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
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
}

var EventEmitter = require('events').EventEmitter;
var changeListener = new EventEmitter();

var ROT = require("rot");

ROT.RNG.setSeed(12345);
ROT.DEFAULT_WIDTH = 80;
ROT.DEFAULT_HEIGHT = 30;

var entities = {};
var activeEntities = {};
var entitiesByLocation = [];
var inventories = {}; 

var genId;
(function() {
    var id = 0;
    genId = function() { return id++; }
})();

var mapData = [];

var utilities = {

    genId: genId,

    getValidPosition: function(level) {
      utilities.ensureLevelExists(level);
      do {
        x = Math.floor(Math.random() * ROT.DEFAULT_WIDTH);
        y = Math.floor(Math.random() * ROT.DEFAULT_HEIGHT);
        // reject solid walls and light-blocking entities
      } while (mapData[level][x][y] &&
               !utilities.getEntitiesByLocation(level, x, y).some(function(e) { return e.blocksLight; }))
      return {x: x, y: y}
    },

    ensureLevelExists: function(level) {
      if (typeof mapData[level] == 'undefined') {
        utilities.generateMapLevel(level);
      }
    },

    generateMapLevel: function(level) {
        mapData[level] = [];
        entitiesByLocation[level] = {};
        mapGenerator = new ROT.Map.Digger();
        mapGenerator.create(function(x, y, type) {
            if(typeof mapData[level][x] == 'undefined') mapData[level][x] = [];
            mapData[level][x][y] = type;
        });
        
        var rooms = mapGenerator.getRooms();
        var upStairs = rooms[Math.floor(ROT.RNG.getUniform() * rooms.length)];
        var downStairs = rooms[Math.floor(ROT.RNG.getUniform() * rooms.length)];
        
        var upId = genId();
        entities[upId] = {
	        id : upId,
	        symbol : '<',
	        color: "#FF0",
	        y : Math.floor(upStairs.getTop() + ((-upStairs.getTop() + upStairs.getBottom()) / 2)),
	        x : Math.floor(upStairs.getLeft() + ((-upStairs.getLeft() + upStairs.getRight()) / 2)),
	        z : level
        };

        var downId = genId();
        entities[downId] = {
	        id : downId,
	        symbol : '>',
	        color: "#FF0",
	        y : Math.floor(upStairs.getTop() - 1 + ((-upStairs.getTop() + upStairs.getBottom()) / 2)),
	        x : Math.floor(upStairs.getLeft() + ((-upStairs.getLeft() + upStairs.getRight()) / 2)),
	        z : level
        };


        for(var i=0; i<rooms.length; ++i) {
            rooms[i].getDoors(function(x, y) {
                if(ROT.RNG.getUniform() > 0.8) return;
                var otherSym = '|';
                if (x == rooms[i].getLeft() - 1 || 
                    x == rooms[i].getRight() + 1)
                  otherSym = '-';
                new construct.Door({
                    id: genId(),
                    otherSymbol: otherSym,
                    isOpen: false,
                    x: x,
                    y: y,
                    z: level
                });
            });
        }
    },

    getEntitiesByLocation: function(z,x,y,entities) {
        if(typeof entitiesByLocation[z] != 'undefined' && typeof entitiesByLocation[z][x+","+y] != 'undefined') {
            return entitiesByLocation[z][x+","+y].slice();
        } else {
            return [];
        }
    },

    // given a master set of entities and an entity id,
    // return the set of entires visible to the entity with the given id
    filterEntities: function(id, inputEntities) {
        var you = inputEntities[id];
        var filteredEntities = {}

        var fov = new ROT.FOV.PreciseShadowcasting(
            lightPassesOnLevel(inputEntities, you.z));

        var item;
        fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
            items = utilities.getEntitiesByLocation(you.z, x, y, inputEntities)
            for(var i=0; i<items.length; ++i) {
                //if(items[i].knownTo) console.log(items[i].knownTo, items[i].knownTo.indexOf(you.id) != -1);
                if(!items[i].invisible && (!items[i].hidden || (items[i].knownTo && items[i].knownTo.indexOf(you.id) != -1))) {
                    filteredEntities[items[i].id] = items[i];
                }
            }
        });
        
        // psychic players see all players on the level
        if(you.psychic) {
            for(var i in inputEntities) {
                var e = inputEntities[i];
                if(e.hasBrain && e.z == you.z) { filteredEntities[e.id] = e; }
            }
        }   

        filteredEntities[id] = you;
        
        return filteredEntities;
    },

    // return a dictionary with "x,y" keys that have the map values of
    // all maps spaces visible to the player with the given id
    filterMapData: function(id, inputMapData) {
        var you = entities[id];
        var filteredMapData = {};
        
        var fov = new ROT.FOV.PreciseShadowcasting(
            lightPassesOnLevel(entities, you.z));

        var item;
        fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
            filteredMapData[x+","+y] = inputMapData[you.z][x][y];
        });
        
        return filteredMapData;
    }

}

// import entity constructors
var construct = require("entity_objects")(utilities, changeListener, entities, activeEntities, entitiesByLocation, mapData);

// generate level 1 map
utilities.generateMapLevel(1);

var boulderpos = utilities.getValidPosition(1);
new construct.Boulder({
    id: genId(),
    x: boulderpos.x,
    y: boulderpos.y,
    z: 1
});
for(var i=0; i<10; ++i) {
    var wandpos = utilities.getValidPosition(1);
    new construct.FreezeWand({
        id: genId(),
        x: wandpos.x,
        y: wandpos.y,
        z: 1
    });
}

io.sockets.on('connection', function (socket) {

    var id = genId();
    var newPos = utilities.getValidPosition(1);
    new construct.Player({
        id: id,
        symbol: '@',
        color: colorFromId(id),
        x: newPos.x,
        y: newPos.y,
        z: 1,
        health: 10
    });

    inventories[id] = [];

    socket.emit('id', id);

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
                inventories[id].push(pickups[i]);
                pickups[i].remove();
            }
            //console.log("pickup", inventories[id]);
        }

        changeListener.emit("change", [entities[id].z], ["pos"]);
    });

    // this should fire whenever a change happens to the world that may implicate a client redraw
    // this could be limited at least to level-specific activity, or even more localized
    function onChange(levels, types) {
        if(entities[id] == undefined) { return; }

        if(levels == undefined || levels.indexOf(entities[id].z) != -1) {
            if(types == undefined || (types.indexOf('pos') != -1 && types.indexOf('map') != -1)) {
                socket.emit('map+pos', {
                                         'pos': utilities.filterEntities(id, entities),
                                         'map': utilities.filterMapData(id, mapData)
                                        });
            } else {
                if(types.indexOf('pos') != -1) { socket.emit('pos', utilities.filterEntities(id, entities)); }
                if(types.indexOf('map') != -1) { socket.emit('map', utilities.filterMapData(id, mapData)); }
            }
        }
    }
    changeListener.on("change", onChange);
        
    // when leaving, remove the player entity and remove his change listener
    socket.on("disconnect", function() {
        var level = entities[id].z;
        entities[id].remove();
        changeListener.removeListener("change", onChange);
        changeListener.emit("change", [level], ['pos']);
    });
    
    changeListener.emit("change");
});

function colorFromId(id) {
    return ["#F00", "#0F0", "#00F", "#FF0", "#F0F", "#0FF"][id % 6];
}


var lightPassesOnLevel = function (ents, level) {
    // determines if light can pass through a given (x,y)
    return function(x, y) {
        if (mapData[level] == undefined ||
            mapData[level][x] == undefined || 
            mapData[level][x][y] != 0) { return false; }
        here = utilities.getEntitiesByLocation(level, x, y, ents);
        for (var i = 0; i < here.length; i++) {
          if (here[i].blocksLight) {
            return false;
          }
        }
        return true;
    }
};

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
