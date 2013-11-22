module.exports = function(utilities, listeners, state, mapData) {

    ROT = require("rot");

    var objects = {};
    var construct = objects;

    var entityProto = objects.entityProto = {
        setLoc: function(z,x,y) {
            var ebl = state.entitiesByLocation;
            if(this.z != undefined) {
                // remove entity from entitesByLocation
                var entsAtLoc = ebl[this.z][this.x+","+this.y];
                if(typeof entsAtLoc != 'undefined') {
                    var index = entsAtLoc.indexOf(this);
                    if(index != -1) { entsAtLoc.splice(index, 1); }
                }
            }

            // move the entity
            this.x = x;
            this.y = y;
            this.z = z;

            utilities.ensureLevelExists(this.z);

            // add the entity to a new position in entitiesByLocation
            if(typeof ebl[this.z][this.x+","+this.y] != 'undefined') {
                ebl[this.z][this.x+","+this.y].push(this);
            } else {
                ebl[this.z][this.x+","+this.y] = [this];
            }
        },
        
        place: function(z,x,y, active) {
            state.entities[this.id] = this;
            if(active) { state.activeEntities[this.id] = this; }
            this.setLoc(z, x, y);
        },

        remove: function() {
            delete state.entities[this.id];
            delete state.activeEntities[this.id];

            if(typeof state.entitiesByLocation[this.z] != 'undefined') {
                var entsAtLoc = state.entitiesByLocation[this.z][this.x+","+this.y];
                if(typeof entsAtLoc != 'undefined') {
                    var index = entsAtLoc.indexOf(this);
                    if(index != -1) {
                        entsAtLoc.splice(index, 1);
                    }
                }
                listeners.change.emit("change", [this.z], ["pos"]);
            }
        },

        // data: x/y/z object
        // pushed: wether this object moved because it was pushed (or it moved volunarily)
        // returns true if step succeeds, or returns whatever object blocked the move
        step: function(data, options) {
            options = options || {};
            var stepper = this;

            // can't move when frozen (but can move from a push)
            if(!options.pushed && this.frozen) { return false; }

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
            if(state.mapData[newPos.z][newPos.x][newPos.y]) {
                // if the moving thing can dig
                if(stepper.canDig) {
                    state.mapData[newPos.z][newPos.x][newPos.y] = 0;
                    listeners.change.emit("change", [newPos.z], ['map']);
                }

                newPos.blocking = true;
                if(stepper.onCollide) { stepper.onCollide(newPos); }

                // we were blocked not by an entity but by terrain;
                // return an object representing the blocking terrain
                return false;
            }
            
            var destEntities = utilities.getEntitiesByLocation(newPos.z, newPos.x, newPos.y, state.entities);
            var blockingEntities = destEntities.filter(function(e) { return !!e.blocking });    

            // if there's nothing there, move freely
            if(blockingEntities.length == 0) {
                stepper.setLoc(newPos.z, newPos.x, newPos.y);
                listeners.change.emit("change", [newPos.z], ['pos', 'map']);

                for(var i=0; i<destEntities.length; ++i) {
                    if(stepper.onCollide) stepper.onCollide(destEntities[i], !options.pushed);
                    if(destEntities[i].onCollide) destEntities[i].onCollide(stepper, false);
                }

                return true;
            }
            
            var pushableEntities = destEntities.filter(function(e) { return e.pushable || e.frozen; });

            if(stepper.canPush && pushableEntities.length != 0) {
                var stepResult = true;
                for(var i=0; i<pushableEntities.length; ++i) {
                    pushableEntity = pushableEntities[i];

                    // define where the pushable entity would end up
                    var stepResult = pushableEntity.step(data, { pushed: true }) && stepResult;
                }

                if(stepResult) {
                    stepper.setLoc(newPos.z, newPos.x, newPos.y);

                    for(var i=0; i<destEntities.length; ++i) {
                        if(stepper.onCollide) { stepper.onCollide(destEntities[i], !options.pushed); }
                        if(destEntities[i].onCollide) { destEntities[i].onCollide(stepper, false); }
                    }
                } else {
                    for(var i=0; i<blockingEntities.length; ++i) {
                        if(stepper.onCollide) { stepper.onCollide(blockingEntities[i], !options.pushed); }
                        if(blockingEntities[i].onCollide) { blockingEntities[i].onCollide(stepper, false); }
                    }
                }

                listeners.change.emit("change", [newPos.z], ['pos']);
                return true;
            }

            for(var i=0; i<blockingEntities.length; ++i) {
                if(stepper.onCollide) { stepper.onCollide(blockingEntities[i], true); }
                if(blockingEntities[i].onCollide) { blockingEntities[i].onCollide(stepper, false); }
            }

            return false;
        },

        canSee: function(target) {
            var you = this;
            var visible = false;

            if(you.z != target.z) { return false; }

            var fov = new ROT.FOV.PreciseShadowcasting(
                utilities.lightPassesOnLevel(state.entities, you.z));
            
            fov.compute(you.x, you.y, 10, function(x, y, r, visibility) {
                if(x == target.x && y == target.y) { visible = true; }
            });

            return visible;
        },

        getVisibleEntitySet: function() {
            return utilities.filterEntities(this.id, state.entities)
        }
    }

    objects.Pit = function(options) {
        this.id = options.id;
        this.symbol = '^';
        this.color = '#FFF';
        this.hidden = true;
        this.knownTo = options.knownTo;

        this.place(options.z, options.x, options.y);
    }
    objects.Pit.prototype = Object.create(entityProto);
    objects.Pit.prototype.onCollide = function(entity) {
        // known to player who just fell
        if(this.knownTo.indexOf(entity.id) == -1) { this.knownTo.push(entity.id); }

        // known to all player that saw it
        // TODO: this actually tests if the trapdoor can see the player, so it does not account for reduced player visibility
        var nearbyEntities = utilities.filterEntities(this.id, state.entities);
        for(var i in nearbyEntities) {
            if(this.knownTo.indexOf(nearbyEntities[i].id) == -1) { this.knownTo.push(nearbyEntities[i].id); }
        }

        listeners.output.emit("output", { message: "You fall down a trapdoor!", targets: [entity.id] });
        listeners.output.emit("output", { message: (entity.name?"The " + entity.name:"Thing #" + entity.id) + " falls into a trapdoor!",
                                        visual: true,
                                        point: this,
                                        omitList:[entity.id] });
        
        // drop the player down a level
        utilities.ensureLevelExists(entity.z + 1);
        var newPos = utilities.getValidPosition(entity.z + 1);
        entity.setLoc(entity.z + 1, newPos.x, newPos.y);
        listeners.change.emit("change", [entity.z, entity.z-1], ["pos", "map"]);
    };

    objects.Player = function(options) {
        this.id = options.id;
        this.color = options.color;
        this.health = options.health;
        this.timeToNext = this.intervalTime;
	    this.setHealth = function(healthDelta) {
            this.health += healthDelta;
            if(this.health <= 0) {
	            var newPlace = utilities.getValidPosition(1);
                this.place(1, newPlace.x, newPlace.y);
	            this.health = 10;
                listeners.output.emit("output", { message: "You die!", targets: [this.id] });
	            listeners.change.emit("change", [this.z], ["pos", "map"]);
            }
            listeners.change.emit("change", [this.z], ["health"]);
        };

        this.place(options.z, options.x, options.y, true);
    }
    objects.Player.prototype = Object.create(entityProto);
    objects.Player.prototype.symbol = '@';
    objects.Player.prototype.forgettable = true;
    objects.Player.prototype.blocking = true;
    objects.Player.prototype.canPush = true;
    objects.Player.prototype.canDig = true;
    objects.Player.prototype.hasBrain = true;
    objects.Player.prototype.intervalTime = 100;
    objects.Player.prototype.onCollide = function(entity, isStepper) {
        if(isStepper && entity.health) {
            listeners.output.emit("output", { message: "You hit the " + entity.name + "!", targets: [this.id] });
            entity.setHealth(-1);
        }
    }

    objects.Boulder = function(options) {
        this.id = options.id;

        this.place(options.z, options.x, options.y);
    }
    objects.Boulder.prototype = Object.create(entityProto);
    objects.Boulder.prototype.color = '#FFF';
    objects.Boulder.prototype.symbol = '0';
    objects.Boulder.prototype.name = 'boulder';
    objects.Boulder.prototype.pushable = true;
    objects.Boulder.prototype.blocking = true;
    objects.Boulder.prototype.blocksLight = true;


    objects.Door = function(options) {
        this.id = options.id;
        this.symbol = '+';
        this.otherSymbol = options.otherSymbol;
        this.isOpen = options.isOpen || false;
        this.blocksLight = true;
        this.blocking = true;
        this.color = "#FF0";

        this.place(options.z, options.x, options.y);
    };
    objects.Door.prototype = Object.create(entityProto);
    objects.Door.prototype.setOpen = function(doOpen) {
        if (this.isOpen != doOpen) {
          var tmp = this.symbol;
          this.symbol = this.otherSymbol;
          this.otherSymbol = tmp;
        }
        this.isOpen = doOpen;
        this.blocking = !doOpen;
        this.blocksLight = !doOpen;
    };

    objects.Mine = function(options) {
        this.id = options.id;
        this.symbol = '.';
        this.color = "#FFF";
        this.sisterMineIds = options.sisterMineIds;
        this.invisible = true;

        this.onCollide = function(entity) {
	        listeners.change.emit("change", [entity.z], ["pos"]);
	        if(typeof entity.health != 'undefined') {
	            entity.setHealth(-10);
	        }
	
	        for(var i = 0; i < 9; i++) {
	            state.entities[this.sisterMineIds[i]].color = "#F00";
	            state.entities[this.sisterMineIds[i]].remove();
	        }
        }

        this.place(options.z, options.x, options.y);
    }
    objects.Mine.prototype = Object.create(entityProto);

    require("./wands")(objects, utilities, listeners, state, mapData);

    var creatures = require("../monsters/entity_creatures")(utilities, listeners, state, construct);

    return objects;
}