var genId;
(function() {
    var id = 0;
    genId = function() { return id++; }
})();

var utilities = {

    genId: genId,

    getValidPosition: function(level) {
        utilities.ensureLevelExists(level);
        do {
            x = Math.floor(Math.random() * ROT.DEFAULT_WIDTH);
            y = Math.floor(Math.random() * ROT.DEFAULT_HEIGHT);
            // reject solid walls and light-blocking entities
        } while (state.mapData[level][x][y] ||
                 utilities.getEntitiesByLocation(level, x, y).some(function(e) { return e.blocksLight; }))
	return {x: x, y: y, z: level}
    },

    ensureLevelExists: function(level) {
        if (typeof state.mapData[level] == 'undefined') {
            utilities.generateMapLevel(level);
        }
    },

    generateMapLevel: function(level) {
        state.mapData[level] = [];
        state.entitiesByLocation[level] = {};
        mapGenerator = new ROT.Map.Digger();
        mapGenerator.create(function(x, y, type) {
            if(typeof state.mapData[level][x] == 'undefined') state.mapData[level][x] = [];
            state.mapData[level][x][y] = type;
        });
        
        var rooms = mapGenerator.getRooms();
        var upStairRoom = rooms[Math.floor(ROT.RNG.getUniform() * rooms.length)];
        var downStairRoom = rooms[Math.floor(ROT.RNG.getUniform() * rooms.length)];
        
        var upId = genId();
        var upStairs = new construct.Stairs({
	    id : upId,
	    symbol : '<',
	    color: "#FF0",
            direction: -1,
	    y : Math.floor(upStairRoom.getTop() + ((-upStairRoom.getTop() + upStairRoom.getBottom()) / 2)),
	    x : Math.floor(upStairRoom.getLeft() + ((-upStairRoom.getLeft() + upStairRoom.getRight()) / 2)),
	    z : level
        });

        var downId = genId();
        var downStairs = new construct.Stairs({
	    id: downId,
            symbol : '>',
            color: "#FF0",
            direction: +1,
	    y: Math.floor(downStairRoom.getTop() - 1 + ((-downStairRoom.getTop() + downStairRoom.getBottom()) / 2)),
	    x: Math.floor(downStairRoom.getLeft() + ((-downStairRoom.getLeft() + downStairRoom.getRight()) / 2)),
	    z: level
        });

        state.mapData[level].upStairs = upStairs;
        state.mapData[level].downStairs = downStairs;

        if(state.mapData[level - 1] != undefined) {
            upStairs.partner = state.mapData[level - 1].downStairs;
            upStairs.partner.partner = upStairs;
        }
        if(state.mapData[level + 1] != undefined) {
            downStairs.partner = state.mapData[level + 1].upStairs;
            downStairs.partner.partner = downStairs;
        }

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

        for(var i=0; i<5; ++i) {
            var boulderpos = utilities.getValidPosition(level);
            new construct.Boulder({
                id: genId(),
                x: boulderpos.x,
                y: boulderpos.y,
                z: level
            });
        }

	for(var i=0; i<10; ++i) {
	    var wandpos = utilities.getValidPosition(level);
	    new construct.FreezeWand({
		id: utilities.genId(),
		x: wandpos.x,
		y: wandpos.y,
		z: level
	    });
	    wandpos = utilities.getValidPosition(level);
	    new construct.FireballWand({
		id: utilities.genId(),
		x: wandpos.x,
		y: wandpos.y,
		z: level
	    });
	    wandpos = utilities.getValidPosition(level);
	    new construct.PortalGun({
		id: utilities.genId(),
		x: wandpos.x,
		y: wandpos.y,
		z: level
	    });

	    creatures.GridBug.spawn(utilities.getValidPosition(level));
	    creatures.Nymph.spawn(utilities.getValidPosition(level));
	}

	creatures.FaceMonster.spawn(utilities.getValidPosition(level));
    },

    // given x,y,z
    getEntitiesByLocation: function(z,x,y) {
        if(typeof state.entitiesByLocation[z] != 'undefined' && typeof state.entitiesByLocation[z][x+","+y] != 'undefined') {
            return state.entitiesByLocation[z][x+","+y].slice();
        } else {
            return [];
        }
    },

    // given a master set of entities and an entity id,
    // return the set of entires visible to the entity with the given id
    filterEntities: function(id, inputEntities) {
        var you = state.entities[id];
        var filteredEntities = {};

        var fov = new ROT.FOV.PreciseShadowcasting(
            utilities.lightPassesOnLevel(inputEntities, you.z));

        var items = [];
        fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
            // if we have the entities index by location already, use that
            if(inputEntities == state.entities) {
                items = utilities.getEntitiesByLocation(you.z, x, y);
            } else {
                for(var i in inputEntities) {
                    if(inputEntities[i].z == you.z && inputEntities[i].x == x && inputEntities[i].y == y) {
                        items.push(inputEntities[i]);
                    }
                }
            }
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

    // given a dict of entities, creates a copy of the set with simplified entity info
    copyEntitiesForClient: function(inputEntities) {
        var copiedEntities = {};
        for(var i in inputEntities) {
            copiedEntities[i] = utilities.copyEntityForClient(inputEntities[i]);
        }
        return copiedEntities;
    },

    // creates a pared-down copy of an object, to send to the client
    copyEntityForClient: function(inputEntity) {
        var fields = ['id','x','y','z','symbol','color','blocking','name'];
        var copiedEntity = {};
        for(var i=0; i<fields.length; ++i) {
            copiedEntity[fields[i]] = inputEntity[fields[i]];
        }
        return copiedEntity;
    },

    // return a dictionary with "x,y" keys that have the map values of
    // all maps spaces visible to the player with the given id
    filterMapData: function(id, inputMapData) {
        var you = state.entities[id];
        var filteredMapData = {};
        
        var fov = new ROT.FOV.PreciseShadowcasting(
            utilities.lightPassesOnLevel(state.entities, you.z));

        var item;
        fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
            filteredMapData[x+","+y] = inputMapData[you.z][x][y];
        });
        
        return filteredMapData;
    },

    diffMapForPlayer: function(id, mapData) {
        var mapDataDiff = {};
        if(state.playerKnowledge[id].map[state.entities[id].z] == undefined) {
            state.playerKnowledge[id].map[state.entities[id].z] = {};
        }
        var playerMap = state.playerKnowledge[id].map[state.entities[id].z];
        for(var i in mapData) {
            if(mapData[i] != playerMap[i]) {
                playerMap[i] = mapData[i];
                mapDataDiff[i] = mapData[i];
            }
        }
        return mapDataDiff;
    },

    // the player can see visibleEntities; we are trying to communicate that set of entities
    // the player has a set of the last entities he could see
    // so we diff these sets
    diffEntitiesForPlayer: function(id, visibleEntities) {
        var entitiesDiff = { "add": {}, "remove": [] };
        if(state.playerKnowledge[id].entities[state.entities[id].z] == undefined) {
            state.playerKnowledge[id].entities[state.entities[id].z] = {};
        }
        var playerKnownEntities = state.playerKnowledge[id].entities[state.entities[id].z];

        // if th eplayer's levelChanged flag is set, report the player's position
        // HACK: this is to avoid a bug in level-changing
        if(state.entities[id].changedLevel) {
            state.entities[id].changedLevel = false;
            entitiesDiff["add"][id] = visibleEntities[id];
        }

        // if we should see something we saw previosuly, but it is now missing, remove it
        var expectedVisible = utilities.filterEntities(id, playerKnownEntities);
        for(var i in expectedVisible) {
            if(visibleEntities[i] == undefined) {
                entitiesDiff["remove"].push(i);
                delete playerKnownEntities[i];
            }
        }

        for(i in visibleEntities) {
            // if entity is not yet known
            if(playerKnownEntities[i] == undefined) {
                playerKnownEntities[i] = visibleEntities[i];
                entitiesDiff["add"][i] = visibleEntities[i];
            } else {
                var fields = ['x','y','z','symbol','color','blocking','name'];
                for(var j=0; j<fields.length; ++j) {
                    // if the entity is known but differs in any field, it has changed and should be replaced
                    if(playerKnownEntities[i][fields[j]] != visibleEntities[i][fields[j]]) {
                        entitiesDiff["add"][i] = visibleEntities[i];
                        playerKnownEntities[i] = visibleEntities[i];
                        break;
                    }
                }
            }
        }
        // remove entites the player could see last round but does not see any more
        for(i in playerKnownEntities) {
            if(state.entities[i] == undefined) {
                entitiesDiff["remove"].push(i);
                delete playerKnownEntities[i];
            } else if(state.entities[i].z != state.entities[id].z) {
                entitiesDiff["remove"].push(i);
                delete playerKnownEntities[i];
            } else if(visibleEntities[i] == undefined && state.entities[i].forgettable) {
                entitiesDiff["remove"].push(i);
                delete playerKnownEntities[i];
            }
        }

        return entitiesDiff;
    },

    lightPassesOnLevel: function (ents, level) {
        // determines if light can pass through a given (x,y)
        return function(x, y) {
            if (state.mapData[level] == undefined ||
                state.mapData[level][x] == undefined || 
                state.mapData[level][x][y] != 0) { return false; }

            // return whether this space has any light-blocking entities
            return !(utilities.getEntitiesByLocation(level, x, y).some(function(e) { return e.blocksLight; }));
        }
    },

    passableOnLevel: function (ents, level, isBlockingFunc) {
        // determines if light can pass through a given (x,y)
        return function(x, y) {
            if (state.mapData[level] == undefined ||
                state.mapData[level][x] == undefined || 
                state.mapData[level][x][y] != 0) { return false; }
            var here = utilities.getEntitiesByLocation(level, x, y);
            for (var i = 0; i < here.length; i++) {
                if (isBlockingFunc(here[i])) {
                    return false;
                }
            }
            return true;
        }
    }

}

module.exports = utilities;

var ROT = require("rot");
var state = require("./state");
var listeners = require("./listeners");
var construct = require("./objects/entity_objects");
var construct = require("./objects/entity_objects");
var creatures = require("./monsters/entity_creatures");