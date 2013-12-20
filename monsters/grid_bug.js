module.exports = function(creatures, utilities, listeners, state, construct) {

    creatures.GridBug = function(options) {
        this.id = options.id;
        if(options.interval) {
            this.intervalTime = options.interval;
        }
        this.timeToNext = this.intervalTime;
        
        this.onCollide = function(entity, isStepper) {
            if(isStepper && entity instanceof construct.Player) {
                listeners.output.emit("output", { message: "The " + this.name + " bites!", targets: [entity.id] });
                entity.setHealth(-1);
            }
        }

        this.health = 4;

        this.place(options.z, options.x, options.y, true);
    }
    creatures.GridBug.prototype = Object.create(creatures.creatureProto);
    creatures.GridBug.prototype.intervalTime = 800;
    creatures.GridBug.prototype.color = '#F0F';
    creatures.GridBug.prototype.symbol = 'x';
    creatures.GridBug.prototype.name = 'grid bug';
    creatures.GridBug.prototype.hasBrain = true;

    creatures.GridBug.prototype.act = function() {
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

    creatures.GridBug.spawn = function(point) {
        point.id = utilities.genId();
        new creatures.GridBug(point);        
    }

    return creatures;

};
