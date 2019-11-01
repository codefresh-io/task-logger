const sinon = require('sinon');

const createFirebaseStub = function () {
    const Firebase = function (path) {
        this.path = path;
    };

    Firebase.prototype.authWithCustomToken = sinon.stub().yields();
    Firebase.prototype.push = sinon.spy();
    Firebase.prototype.set = sinon.spy();
    Firebase.prototype.update = sinon.spy();
    Firebase.prototype.child = function (newPath) {
        return new Firebase(`${this.path}/${newPath}`);
    };

    return Firebase;
};

const createFirebaseStubWithDebugger = function (deferredSteamFlow) {
    const Firebase = createFirebaseStub();

    Firebase.prototype.handlers = {};
    Firebase.prototype.on = (event, handler) => {
        Firebase.prototype.handlers[event] = handler;
    };
    Firebase.prototype.off = (event) => {
        delete Firebase.prototype.handlers[event];
    };
    Firebase.prototype.child_added = (value) => {
        Firebase.prototype.handlers.child_added({ val: () => value });
    };
    Firebase.prototype.push = (val) => {
        deferredSteamFlow.resolve(val);
    };

    return Firebase;
};

module.exports = {
    createFirebaseStub,
    createFirebaseStubWithDebugger,
};
