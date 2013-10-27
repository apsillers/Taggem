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

var ROT = require("rot");

ROT.RNG.setSeed(12345);
ROT.DEFAULT_WIDTH = 80;
ROT.DEFAULT_HEIGHT = 30;

var entities = {};
var activeEntities = {};

var genId;
(function() {
    var id = 0;
    genId = function() { return id++; }
})();

// generate level 1 map
var mapData = [];

function getValidPosition(level) {
  ensureLevelExists(level);
  do {
    x = Math.floor(Math.random() * ROT.DEFAULT_WIDTH);
    y = Math.floor(Math.random() * ROT.DEFAULT_HEIGHT);
  } while (mapData[level][x][y])
  return {x: x, y: y}
}

function ensureLevelExists(level) {
  if (typeof mapData[level] == 'undefined') {
    generateMapLevel(level);
  }
}

function generateMapLevel(level) {
    mapData[level] = [];
    mapGenerator = new ROT.Map.Digger();
    mapGenerator.create(function(x, y, type) {
        if(typeof mapData[level][x] == 'undefined') mapData[level][x] = [];
        mapData[level][x][y] = type;
    });
    
    var rooms = mapGenerator.getRooms();
    for(var i=0; i<rooms.length; ++i) {
        rooms[i].getDoors(function(x, y) {
            if(ROT.RNG.getUniform() > 0.8) return;
            var otherSym = '|';
            if (x == rooms[i].getLeft() - 1 || 
                x == rooms[i].getRight() + 1)
              otherSym = '-';
            var doorId = genId();
            entities[doorId] = {
                id: doorId,
                symbol: '+',
                otherSymbol: otherSym,
                isOpen: false,
                blocksLight: true,
                blocking: true,
                color: "#FF0",
                x: x,
                y: y,
                z: level
            };
        });
    }
}

generateMapLevel(1);



var boulderid = genId();
var boulderpos = getValidPosition(1);
entities[boulderid] = {
        id: boulderid,
        symbol: '0',
        blocking: true,
        pushable: true,
        color: "#FFF",
        x: boulderpos.x,
        y: boulderpos.y,
        z: 1
    };

var changeListener = new EventEmitter();

io.sockets.on('connection', function (socket) {

    var id = genId();
    var newPos = getValidPosition(1);
    entities[id] = {
        id: id,
        symbol: '@',
        blocking: true,
        canPush: true,
        canDig: true,
        color: colorFromId(id),
        x: newPos.x,
        y: newPos.y,
        z: 1
    };

    socket.emit('id', id);

    socket.on('move', function(data) { step(id, data); });

    socket.on('open', function(data) { setOpen(id, data, true); });
    socket.on('close', function(data) { setOpen(id, data, false); });

    function setOpen(id, data, doOpen) {
      you = entities[id];
      ents = getEntitiesByLocation(you.z, you.x + data.x, you.y + data.y, entities);
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
      changeListener.emit("change", [entities[id].z], ['pos']);
    }

    // data: x/y/z object
    // id: entity ID of thing trying to step
    // returns true if step succeeds, or returns whatever object blocked the move
    function step(id, data) {
        var stepper = entities[id];

        var newPos = {
                       x: stepper.x + data.x,
                       y: stepper.y + data.y,
                       z: stepper.z + (data.z==undefined?0:data.z)
                     };

        // TODO: stairs; move player & create level if does not already exist
        if(data.z == 1 || data.z == -1) {
            return false;
        }
                    
        // if there is a wall
        if(mapData[newPos.z][newPos.x][newPos.y]) {
            // if the moving thing can dig
            if(stepper.canDig) {
                mapData[newPos.z][newPos.x][newPos.y] = 0;
                changeListener.emit("change", [newPos.z], ['map']);
            }

            newPos.blocking = true;
            if(stepper.onCollide) { stepper.onCollide(newPos); }

            // we were blocked not by an entity but by terrain;
            // return an object representing the blocking terrain
            return false;
        }
        
        var destEntities = getEntitiesByLocation(newPos.z, newPos.x, newPos.y, entities);
        var blockingEntities = destEntities.filter(function(e) { return !!e.blocking });    

        // if there's nothing there, move freely
        if(blockingEntities.length == 0) {
            stepper.x = newPos.x;
            stepper.y = newPos.y;
            stepper.z = newPos.z;
            changeListener.emit("change", [newPos.z], ['pos', 'map']);

            for(var i=0; i<destEntities.length; ++i) {
                if(destEntities[i].onCollide) destEntities[i].onCollide(stepper);
                if(stepper.onCollide) stepper.onCollide(destEntities[i]);
            }

            return true;
        }
        
        var pushableEntities = destEntities.filter(function(e) { return e.pushable; });

        if(stepper.canPush && pushableEntities.length != 0) {
            var stepResult = true;
            for(var i=0; i<pushableEntities.length; ++i) {
                pushableEntity = pushableEntities[i];

                // define where the pushable entity would end up
                var stepResult = step(pushableEntity.id, data) && stepResult;
            }

            if(stepResult) {
                stepper.x = newPos.x;
                stepper.y = newPos.y;
                stepper.z = newPos.z;

                for(var i=0; i<destEntities.length; ++i) {
                    if(stepper.onCollide) { stepper.onCollide(destEntities[i]); }
                    if(destEntities[i].onCollide) { destEntities[i].onCollide(stepper); }
                }
            } else {
                for(var i=0; i<blockingEntities.length; ++i) {
                    if(stepper.onCollide) { stepper.onCollide(blockingEntities[i]); }
                    if(blockingEntities[i].onCollide) { blockingEntities[i].onCollide(stepper); }
                }
            }

            changeListener.emit("change", [newPos.z], ['pos']);
            return true;
        }

        for(var i=0; i<blockingEntities.length; ++i) {
            if(stepper.onCollide) { stepper.onCollide(blockingEntities[i]); }
            if(blockingEntities[i].onCollide) { blockingEntities[i].onCollide(stepper); }
        }

        return false;
    }
    
    socket.on("zap", function(data) {
	var trapID = genId();
	entities[trapID] = {
	    id: trapID,
	    symbol: ".",
	    color: "#FFF",
	    x: entities[id].x + (data.x * 4),
	    y: entities[id].y + (data.y * 4),
	    z: entities[id].z,
	    onCollide: function(entity) {
		ensureLevelExists(entity.z + 1);
		entity.z += 1;
		var foo = getValidPosition(entity.z);
		entity.x = foo.x;
		entity.y = foo.y;
		this.symbol = "^";
		changeListener.emit("change", [entity.z, entity.z-1], ["pos", "map"]);
	    }
	}
    });
    
    socket.on("shoot", function(data) {
        var shotId = genId();
        entities[shotId] = activeEntities[shotId] = {
            id: shotId,
            symbol: '*',
            color: "#0FF",
            x: entities[id].x,
            y: entities[id].y,
            z: entities[id].z,
            timeToNext: 100,
            intervalTime: 100,
            act: function() {
                step(shotId, data);
            },
            onCollide: function(entity) {
                if(!entity) return;

                if(entity.blocking) {
                    var level = entities[shotId].z;
                    delete entities[shotId];
                    delete activeEntities[shotId];

                    entity.frozen = true;
                    entity.pushable = true;
                    setTimeout(function() { entity.frozen = false; entity.pushable = false; }, 2000);
                    changeListener.emit("change", [level], ['pos']);
                }
            }
        };

        changeListener.emit("change");
    });


    // this should fire whenever a change happens to the world that may implicate a client redraw
    // this could be limited at least to level-specific activity, or even more localized
    function onChange(levels, types) {
        if(levels == undefined || levels.indexOf(entities[id].z) != -1) {
            if(types == undefined || types.indexOf('map') != -1) { socket.emit('map', filterMapData(id, mapData)); }
            if(types == undefined || types.indexOf('pos') != -1) { socket.emit('pos', filterEntities(id, entities)); }
        }
    }
    changeListener.on("change", onChange);
        
    // when leaving, remove the player entity and remove his change listener
    socket.on("disconnect", function() {
        var level = entities[id].z;
        delete entities[id];
        changeListener.removeListener("change", onChange);
        changeListener.emit("change", [level], ['pos']);
    });
    
    changeListener.emit("change");
});

function colorFromId(id) {
    return ["#F00", "#0F0", "#00F", "#FF0", "#F0F", "#0FF"][id % 6];
}

var lightPassesOnLevel = function (ents, level) { return function(x, y) {
    if (mapData[level] == undefined ||
        mapData[level][x] == undefined || 
        mapData[level][x][y] != 0) { return false; }
    here = getEntitiesByLocation(level, x, y, ents);
    for (var i = 0; i < here.length; i++) {
      if (here[i].blocksLight) {
        return false;
      }
    }
    return true;
}};

// given a master set of entities and an entity id,
// return the set of entires visible to the entity with the given id
function filterEntities(id, inputEntities) {
    var you = inputEntities[id];
    var filteredEntities = {}

    var fov = new ROT.FOV.PreciseShadowcasting(
        lightPassesOnLevel(inputEntities, you.z));

    var item;
    fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
        items = getEntitiesByLocation(you.z, x, y, inputEntities)
        for(var i=0; i<items.length; ++i) {
            filteredEntities[items[i].id] = items[i];
        }
    });
    
    // TODO: add entites known via non-sight (telepathy, etc)
    
    filteredEntities[id] = inputEntities[id];
    
    return filteredEntities;
}

function getEntitiesByLocation(z,x,y,entities) {
    var collection = [];
    for(i in entities) {
        if(entities[i].x == x && entities[i].y == y && entities[i].z == z) {
            collection.push(entities[i]);
        }
    }
    return collection;
}

function filterMapData(id, inputMapData) {
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

