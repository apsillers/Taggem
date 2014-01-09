var state = require("../state");
var utilities = require("../utilities");
var listeners = require("../listeners");
var construct = require("../objects/entity_objects")
var creatures = require("./entity_creatures");

creatures.Bee = function(options) {
    this.id = options.id;
    this.swarm = options.swarm;
    if(options.interval) {
        this.intervalTime = options.interval;
    }
    this.timeToNext = this.intervalTime;
    
    this.onCollide = function(entity, isStepper) {
        if(isStepper && entity instanceof construct.Player) {
            listeners.output.emit("output", { message: "The bee stings!", targets: [entity.id] });
            entity.setHealth(-1);
        }
    }

    this.health = 2;

    this.place(options.z, options.x, options.y, true);
}
creatures.Bee.prototype = Object.create(creatures.creatureProto);
creatures.Bee.prototype.intervalTime = 800;
creatures.Bee.prototype.color = '#FF0';
creatures.Bee.prototype.symbol = 'b';
creatures.Bee.prototype.name = 'killer bee';
creatures.Bee.prototype.hasBrain = true;

creatures.Bee.act = function() {
    // TODO: idle mode
    // idea: calculate swarm center and deviate from center point
    // idea: move center randomly?	

    var filteredEntities = this.getVisibleEntitySet();
    var playersInRange = [];

    // find all players visible to this creature
    for(var i in filteredEntities) {
        if(filteredEntities[i] instanceof construct.Player) {
            playersInRange.push(filteredEntities[i]);
        }
    }

    // there is a player in sight
    if(playersInRange.length > 0) {
        // sort visible players by health then by distance
        playersInRange.sort(function(a,b) {
            function distance(foo, bar) { return Math.sqrt((foo.x-bar.x)*(foo.x-bar.x) + (foo.y-bar.y)*(foo.y-bar.y)); }
            return (a.health - b.health) ||
                (distance(this,a) - distance(this,b));
        });

        // bug's new target is the player's location
        this.target = { x: playersInRange[0].x, y: playersInRange[0].y };
    }

    // if the bug has a target to get to, process toward it
    if(this.target) {
        var found = this.stepToward(this.target);
        // if no path to target exists, give up
        if(!found) {
            this.target = undefined;
        }
    }
};

function Swarm(point) {
    for(var i=0; i < 2; ++i) {
        for(var i=j; j < 2; ++j) {
            new creature.Bee({
                x: point.x + i,
		y: point.y + j,
		id: utilities.genId(),
		z: point.z,
		swarm: this
	    });
        }
    }
}

creatures.Bee.spawn = function(point) {
    new creatures.Swarm(point);        
}
