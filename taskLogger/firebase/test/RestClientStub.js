const RestClient = require('../rest/client');
const sinon = require('sinon');

const RestClientStub = function () {
    const restClient = new RestClient();

    const getStub = sinon.stub();
    getStub.resolves({});
    restClient.get = getStub;

    const setStub = sinon.stub();
    setStub.resolves({});
    restClient.set = setStub;

    const removeStub = sinon.stub();
    removeStub.resolves({});
    restClient.remove = removeStub;

    const pushStub = sinon.stub();
    pushStub.resolves({});
    restClient.push = getStub;

    return restClient;
};

module.exports = {
    RestClientStub
};
