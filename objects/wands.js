module.exports = function(objects, utilities, listeners, state, mapData) {

    var construct = objects;

    var shotProto = objects.shotProto = Object.create(objects.entityProto);
    shotProto.act = function() {
        this.remove();
    };
    shotProto.intervalTime = 499;
    shotProto.symbolForVector = function(vector) {
        if(vector.x == 0) return "|";
        if(vector.y == 0) return "-";
        if(vector.x == vector.y) return "\\";
        return "/";
    }
    
    objects.FreezeShot = function(options) {
        this.id = options.id;
        this.symbol = this.symbolForVector(options.vector);
        if(options.interval) {
            this.intervalTime = options.interval;
        }
        this.timeToNext = this.intervalTime;

        this.place(options.z, options.x, options.y, true);
    }
    objects.FreezeShot.prototype = Object.create(shotProto);
    objects.FreezeShot.prototype.color = "#0FF";
    objects.FreezeShot.prototype.onCollide = function(entity) {
        if(!entity) return;

        if(entity.blocking) {
            var level = this.z;
            entity.frozen = true;
            setTimeout(function() { entity.frozen = false; }, 2000);
            listeners.change.emit("change", [level], ['pos']);
        }
    }

    objects.FireballShot = function(options) {
        this.id = options.id;
        this.symbol = this.symbolForVector(options.vector);
        if(options.interval) {
            this.intervalTime = options.interval;
        }
        this.timeToNext = this.intervalTime;

        this.place(options.z, options.x, options.y, true);
    }
    objects.FireballShot.prototype = Object.create(shotProto);
    objects.FireballShot.prototype.color = "#F00";
    objects.FireballShot.prototype.onCollide = function(entity) {
        if(!entity) return;

        if(entity.blocking) {
            var level = this.z;
            if(entity.health) { entity.setHealth(-2); }
            listeners.change.emit("change", [level], ['pos']);
        }
    }

    wandProto = objects.wandProto = Object.create(objects.entityProto);
    wandProto.onFire = function(id, data) {
        var range = 5;
        var shooter = state.entities[id];
        var space = { x: shooter.x, y: shooter.y, z: shooter.z };
        space.x += data.x; space.y += data.y;

        // draw spaces
        while(range && state.mapData[space.z] && state.mapData[space.z][space.x] && !state.mapData[space.z][space.x][space.y]) {
            var shot = new this.shotType({
                id: utilities.genId(),
                x: space.x,
                y: space.y,
                z: space.z,
                vector: data
            });

            var nonCreatureBlock = false;
            utilities.getEntitiesByLocation(space.z, space.x, space.y).filter(function(ent) { return ent.blocking; }).forEach(function(ent) {
                shot.onCollide(ent);
                if(ent.blocksLight) { nonCreatureBlock = true; }
            })

            if(nonCreatureBlock) { break; }

            space.x += data.x; space.y += data.y;
            range--;
        }

        listeners.change.emit("change", [state.entities[id].z], ["pos"]);
    }

    objects.FreezeWand = function(options) {
        this.id = options.id;
        this.name = "wand of freezing";
        this.collectable = true;
        this.shootable = true;
        this.shotType = construct.FreezeShot;
        this.place(options.z, options.x, options.y);
    }
    objects.FreezeWand.prototype = Object.create(wandProto);
    objects.FreezeWand.prototype.symbol = "/";
    objects.FreezeWand.prototype.color = "#0FF";

    objects.FireballWand = function(options) {
        this.id = options.id;
        this.name = "wand of fireball";
        this.collectable = true;
        this.shootable = true;
        this.shotType = construct.FireballShot;

        this.place(options.z, options.x, options.y);
    }
    objects.FireballWand.prototype = Object.create(wandProto);
    objects.FireballWand.prototype.symbol = "/";
    objects.FireballWand.prototype.color = "#F00";

    var creatures = require("../monsters/entity_creatures")(utilities, listeners, state, construct);
}
