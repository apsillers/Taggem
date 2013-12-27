module.exports = function(objects, utilities, listeners, state) {

    objects.PortalGun = function(options) {
        this.id = options.id;
        this.symbol = 'r';
        this.color = '#fff';
	this.name = "portal gun";
        this.collectable = true;
        this.shootable = true;

	this.isBlue = true;

	this.portals = [];

        this.place(options.z, options.x, options.y);
    }
    objects.PortalGun.prototype = Object.create(objects.entityProto);
    objects.PortalGun.prototype.onFire = function(id, vector) {
        var shooter = state.entities[id];

	if(this.portals.length == 2) {
	    this.portals[1].remove();
	    this.portals.pop();
	}

        this.portals.unshift(new Portal({
	    id: utilities.genId(),
	    x: shooter.x + vector.x,
	    y: shooter.y + vector.y,
	    z: shooter.z,
	    color: this.isBlue?"#00F":"#FA0"
	}));

	if(this.portals.length == 2) {
	    this.portals[0].partner = this.portals[1];
	    this.portals[1].partner = this.portals[0];
	}

	this.isBlue = !this.isBlue;
    };

    function Portal(options) {
	this.id = options.id;
        this.symbol = '^';
        this.color = options.color;

	this.place(options.z, options.x, options.y);

	listeners.change.emit("change", [options.z], ["pos"]);
    }
    Portal.prototype = Object.create(objects.entityProto);
    Portal.prototype.onCollide = function(entity, isStepper) {
	// if only one portal exists
	if(!this.partner) return;

	var oldZ = entity.z;
	entity.place(this.partner.z, this.partner.x, this.partner.y);
	listeners.change.emit("change", [entity.z, oldZ], ["pos", "map"]);
    }
}