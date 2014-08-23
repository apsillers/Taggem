var state = require("./state");
var listeners = require("./listeners");
var utilities = require("./utilities");
var construct = require("./objects/entity_objects");
var creatures = require("./monsters/entity_creatures");

module.exports = function(socket) {

    var id = utilities.genId();
    var gmlevel = 1;

    state.playerKnowledge[id] = {
        map: [],
        entities: {}
    }

    socket.on("monster", function(data) {
	var name = data.name;
	creatures[name].spawn({ z: gmlevel, x: data.x, y: data.y });
	listeners.change.emit("change", [gmlevel], ['pos']);

    });

    function setLevel(data) {
	utilities.ensureLevelExists(data.level);
        gmlevel = data.level;
	var level = data.level;

	state.playerKnowledge[id].map[level] = {};

        for(var x=0; x<state.mapData[level].length; x++) {
            for(var y=0; y<state.mapData[level][x].length; ++y) {
                state.playerKnowledge[id].map[level][x+","+y] = state.mapData[level][x][y];
            }
        }

        socket.emit('map', state.playerKnowledge[id].map[level]);
    }

    setLevel({ level: 1 });

    socket.on("setLevel", function(data) {
	setLevel(data);
    });

    // this should fire whenever a change happens to the world that may implicate a client redraw
    // this could be limited at least to level-specific activity, or even more localized
    function onChange(levels, types, players, msg) {

        if(types.indexOf('pos') != -1) {
	    socket.emit('pos',
			utilities.diffEntitiesForPlayer({ id: id, GM: true, level: gmlevel },
							utilities.copyEntitiesForClient(
							    utilities.filterEntities("GM", state.entities))
						       ));
	}
        if(types.indexOf('map') != -1) {
            var mapDiff = utilities.diffMapForPlayer({ GM:true, id:id, level: gmlevel }, utilities.filterMapData("GM", state.mapData));
            socket.emit('map', mapDiff);
        }

    }
    listeners.change.on("change", onChange);
        
    // when leaving, remove the player entity and remove his change listener
    socket.on("disconnect", function() {
        delete state.playerKnowledge[id];
    });

    listeners.output.on("output", outputHandler);
    function outputHandler(options) {
        if((options.omitList == undefined || options.omitList.indexOf(id) == -1) &&
           (options.targets == undefined || options.targets.indexOf(id) != -1) &&
           (!options.visual || state.entities[id].canSee(options.point)))  {
            socket.emit("output", options.message);
        }
    }


    listeners.output.emit("output", { message: "Welcome to Taggem!", targets: [id] });
}