module.exports = function(creatures, utilities, listeners, state, construct) {

    creatures.Nymph = function(options) {
        this.id = options.id;
        this.color = options.color || "#00F";
        if(options.interval) {
            this.intervalTime = options.interval;
        }
        this.timeToNext = this.intervalTime;
        
        this.onCollide = function(entity, isStepper) {
            if(this.angry && isStepper && entity instanceof construct.Player) {
                entity.setHealth(-1);
                listeners.output.emit("output", { message: "The nymph hits!", targets: [entity.id] });
            }

            // if angry or being collided into
            if((this.angry || !isStepper) && entity.inventory) {
                var inv = entity.inventory.filter(function(e) { return e != undefined });
                if(inv.length != 0) {
                    var item = inv[Math.floor(inv.length * Math.random())];
                    var invIndex = entity.inventory.indexOf(item);
                    listeners.output.emit("output", { message: "The nymph steals your " + item.name + "!", targets: [entity.id] });
                    delete entity.inventory[invIndex];
                    listeners.change.emit("change", [this.z], ["inventory"], [entity.id], { change: "remove", slot: invIndex });
                    var newLoc = utilities.getValidPosition(this.z);
                    this.setLoc(this.z, newLoc.x, newLoc.y);
                }
            }

        }

        this.health = 5;

        this.angry = false;
        this.onDamage = function() { this.angry = true; }

        this.act = function() {
            if(!this.angry) {
                Math.random()>0.5?this.step({ x: 1 - Math.floor(Math.random()*3), y: 1 - Math.floor(Math.random()*3) }):null;
                return;
            }

            var filteredEntities = utilities.filterEntities(this.id, state.entities);
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

        this.place(options.z, options.x, options.y, true);
    }
    creatures.Nymph.prototype = Object.create(creatures.creatureProto);
    creatures.Nymph.prototype.intervalTime = 700;
    creatures.Nymph.prototype.forgettable = true;
    creatures.Nymph.prototype.symbol = 'n';
    creatures.Nymph.prototype.name = 'nymph';
    creatures.Nymph.prototype.hasBrain = true;
}
