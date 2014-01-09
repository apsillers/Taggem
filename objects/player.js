var state = require("../state");
var utilities = require("../utilities");
var listeners = require("../listeners");
var objects = require("./entity_objects")

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
objects.Player.prototype = Object.create(objects.entityProto);
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
