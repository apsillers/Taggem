var state = require("../state");
var utilities = require("utilities");
var listeners = require("../listeners");
var construct = require("../objects/entity_objects")
var creatures = require("./entity_creatures");

creatures.FaceMonster = function(options) {
    this.id = options.id;
    if(options.interval) {
        this.intervalTime = options.interval;
    }
    this.timeToNext = this.intervalTime;
    
    this.onCollide = function(entity, isStepper) {
        if(isStepper && entity instanceof construct.Player) {
            listeners.output.emit("output", { message: "The SCP hits!", targets: [entity.id] });
            entity.setHealth(-1);
        } else if(isStepper && entity.setOpen) {
            entity.setOpen(true);
        } else if(isStepper && entity.blocking) {
            this.setLoc(this.z, entity.x, entity.y);
        }
    }

    this.health = 4;

    this.act = function() {

        if(!this.target) {
            var filteredEntities = this.getVisibleEntitySet();
            var playersInRange = [];

            // find all players visible to this creature
            for(var i in filteredEntities) {
                if(filteredEntities[i] instanceof construct.Player) {
                    var player = filteredEntities[i];
                    if(player.canSee(this) && Math.abs(player.x - this.x) < 3 && Math.abs(player.y - this.y) < 3) {
                        listeners.output.emit("output", { message: "You see SCP-096's face!", targets: [player.id] });
                        listeners.output.emit("output", { message: "SCP-096 screams!", visible: true, point:this });
                        this.target = player;
                    }
                }
            }
        }

        // if the SCP has a target to get to, process toward it
        if(this.target) {
            var found = this.stepToward(this.target, function(ent) { return false; });
            // if no path to target exists, give up
            if(!found) {
                this.target = undefined;
            }
        }
    };

    this.place(options.z, options.x, options.y, true);
}
creatures.FaceMonster.prototype = Object.create(creatures.creatureProto);
creatures.FaceMonster.prototype.intervalTime = 600;
creatures.FaceMonster.prototype.color = '#FFF';
creatures.FaceMonster.prototype.symbol = 'H';
creatures.FaceMonster.prototype.name = 'SCP';
creatures.FaceMonster.prototype.hasBrain = true;
creatures.FaceMonster.prototype.canDig = true;
creatures.FaceMonster.prototype.canPush = true;

creatures.FaceMonster.spawn = function(point) {
    point.id = utilities.genId();
    new creatures.FaceMonster(point);
}

