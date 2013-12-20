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
var listeners = {};
listeners.change = new EventEmitter();
listeners.output = new EventEmitter();

var ROT = require("rot");

ROT.DEFAULT_WIDTH = 80;
ROT.DEFAULT_HEIGHT = 30;

var state = {};
state.entities = {};
state.activeEntities = {};
state.entitiesByLocation = [];
state.mapData = [];
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

var utilities = require("utilities")(listeners, state, genId, playerKnowledge);

// import entity constructors
var construct = require("./objects/entity_objects")(utilities, listeners, state);
var creatures = require("./monsters/entity_creatures")(utilities, listeners, state, construct);

// generate level 1 map
utilities.generateMapLevel(1);


for(var i=0; i<10; ++i) {
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

    creatures.GridBug.spawn(utilities.getValidPosition(1))
    creatures.Nymph.spawn(utilities.getValidPosition(1))

}

creatures.FaceMonster.spawn(utilities.getValidPosition(1))


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
        health: 10
    });

    var player = state.entities[id];

    inventories[id] = [];
    player.inventory = inventories[id];

    socket.emit('id', id);
    socket.emit('health', { value: 10 });

    socket.on('open', function(data) { player.act = function() { setOpen(id, data, true); delete this.act; }; });
    socket.on('close', function(data) { player.act = function() { setOpen(id, data, false); delete this.act; }; });

    function setOpen(id, data, doOpen) {
      var you = state.entities[id];
      var ents = utilities.getEntitiesByLocation(you.z, you.x + data.x, you.y + data.y, state.entities);
      openables = ents.filter(function (e) { return typeof e.isOpen != 'undefined'; });
      for (var i = 0; i < openables.length; i++) {
        openables[i].setOpen(doOpen);
      }
      listeners.change.emit("change", [you.z], ['pos', 'map']);
    }

    socket.on('move', function(data) {
        player.act = function() {
            state.entities[id].step(data);
            delete this.act;
            //console.log(state.entitiesByLocation[player.z][player.x+","+player.y].map(function(e) { return e.symbol; }));
        };
    });
    
    socket.on("zap", function(data) {
        player.act = function() {
            var you = state.entities[id];
	        new construct.Pit({
	            id: genId(),
                knownTo: [id],
	            x: you.x + (data.x * 4),
	            y: you.y + (data.y * 4),
	            z: you.z,
	        });
            listeners.change.emit("change", [you.z], ['pos']);

            delete this.act;
        };
    });
    
    socket.on("mine", function(data) {
        player.act = function() {
            var you = state.entities[id];
	        var myIds = [];
	        var counter = 0;
	        for(var i = -1; i <= 1; i++) {
	            for(var j = -1; j <= 1; j++) {
		            var mineId = genId();
		
		            myIds[counter] = mineId;
		            counter = counter + 1;

		            new construct.Mine({
		                id : mineId,
		                x: you.x + i,
		                y: you.y + j,
		                z: you.z,
		                sisterMineIds: myIds
		            });
                }
	        }

            delete this.act;
        };

    });

    socket.on("shoot", function(data) {
        player.act = function() {
            var shotItem = inventories[id][data.itemNum];

            if(shotItem && shotItem.onFire) {
                shotItem.onFire(id, data);
            } else {
                //TODO: report failure to user
                //console.log("shot failed");
            }
            delete this.act;
        };
    });

    socket.on("telepathy", function(data) {
        player.psychic = data.active;

        listeners.change.emit("change", [player.z], ["pos"]);
    });

    socket.on("invisible", function(data) {
        player.invisible = data.active;

        listeners.change.emit("change", [player.z], ["pos"]);
    });

    socket.on("mapall", function(data) {
        var level = player.z;
        for(var x=0; x<state.mapData[level].length; x++) {
            for(var y=0; y<state.mapData[level][x].length; ++y) {
                playerKnowledge[id].map[level][x+","+y] = state.mapData[level][x][y];
            }
        }

        socket.emit('map', playerKnowledge[id].map[level]);
    });

    socket.on("pickup", function(data) {
        player.act = function() {
            var you = state.entities[id];
            var ebl = state.entitiesByLocation;
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

            listeners.change.emit("change", [you.z], ["pos"]);

            delete this.act;
        };
    });

    socket.on("drop", function(data) {
        player.act = function() {
            var you = state.entities[id];
            if(inventories[id][data.itemNum] != undefined) {
                inventories[id][data.itemNum].place(you.z, you.x, you.y);
                delete inventories[id][data.itemNum];
            }

            socket.emit("inventory", { change: "remove", slot: data.itemNum });

            listeners.change.emit("change", [you.z], ["pos"]);

            delete this.act;
        }
    });

    // this should fire whenever a change happens to the world that may implicate a client redraw
    // this could be limited at least to level-specific activity, or even more localized
    function onChange(levels, types, players, msg) {
        if(state.entities[id] == undefined) { return; }

        // if this message is not for you, ignore it
        if(players != undefined && players.indexOf(id) == -1) { return; }

        if(levels == undefined || levels.indexOf(state.entities[id].z) != -1) {
            if(types.indexOf('pos') != -1) { socket.emit('pos', utilities.diffEntitiesForPlayer(id,
                                                                    utilities.copyEntitiesForClient(utilities.filterEntities(id, state.entities))
                                                                )); }
            if(types.indexOf('map') != -1) {
                var mapDiff = utilities.diffMapForPlayer(id, utilities.filterMapData(id, state.mapData));
                socket.emit('map', mapDiff);
            }
            if(types.indexOf('health') != -1) { socket.emit('health', { value: state.entities[id].health }); }
            if(types.indexOf('inventory') != -1) { socket.emit('inventory', msg); }
        }
    }
    listeners.change.on("change", onChange);
        
    // when leaving, remove the player entity and remove his change listener
    socket.on("disconnect", function() {
        var level = state.entities[id].z;
        state.entities[id].remove();
        listeners.change.removeListener("change", onChange);
        listeners.output.removeListener("output", outputHandler);
        delete playerKnowledge[id];
        listeners.change.emit("change", [level], ['pos']);
    });
    
    listeners.change.emit("change", [state.entities[id].z], ["pos", "map"]);

    listeners.output.on("output", outputHandler);
    function outputHandler(options) {
        if((options.omitList == undefined || options.omitList.indexOf(id) == -1) &&
           (options.targets == undefined || options.targets.indexOf(id) != -1) &&
           (!options.visual || state.entities[id].canSee(options.point)))  {
            socket.emit("output", options.message);
        }
    }


    listeners.output.emit("output", { message: "Welcome to Taggem!", targets: [id] });
});

function colorFromId(id) {
    return ["#F00", "#0F0", "#00F", "#FF0", "#F0F", "#0FF"][id % 6];
}

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

