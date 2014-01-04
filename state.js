var state = {};
state.entities = {};
state.activeEntities = {};
state.entitiesByLocation = [];
state.mapData = [];

state.inventories = {};
state.inventories.getOpenSlot = function(inv) {
    for(var i=0; i<inv.length; ++i) {
        if(inv[i] == undefined) { return i; }
    }
    return inv.length;
}

state.playerKnowledge = {};


module.exports = state;