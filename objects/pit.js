var state = require("../state");
var utilities = require("../utilities");
var listeners = require("../listeners");
var objects = require("./entity_objects")

objects.Pit = function(options) {
    this.id = options.id;
    this.symbol = '^';
    this.color = '#FFF';
    this.hidden = true;
    this.knownTo = options.knownTo;

    this.place(options.z, options.x, options.y);
}
objects.Pit.prototype = Object.create(objects.entityProto);
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
