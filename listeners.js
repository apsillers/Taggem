var EventEmitter = require('events').EventEmitter;
var listeners = {};
listeners.change = new EventEmitter();
listeners.output = new EventEmitter();

module.exports = listeners;