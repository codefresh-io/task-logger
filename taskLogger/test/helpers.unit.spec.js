const Q                 = require('q');
const chai              = require('chai');

const { expect } = chai;
const sinon             = require('sinon');
const { wrapWithRetry } = require('../helpers');

describe('helpers', () => {

    describe('wrapWithRetry', () => {

        describe('positive', () => {

            it('should succeed if first try succeeds', () => {
                const stub = sinon.stub();
                const res = {};
                stub.resolves(res);
                return wrapWithRetry(stub)
                    .then((result) => {
                        expect(result).to.equal(res);
                        expect(stub.callCount).to.equal(1);
                    });
            });

            it('should succeed if first try fails because of timeout and second succeeds', () => {
                const stub = sinon.stub();
                const res = {};
                const error = new Error('my error');
                stub.onFirstCall().rejects(error);
                stub.onSecondCall().resolves(res);
                return wrapWithRetry(stub, { factor: 0.1, minTimeout: 1 })
                    .then((result) => {
                        expect(result).to.equal(res);
                        expect(stub.callCount).to.equal(2);
                    });
            });

            it('should succeed if first try fails and second succeeds', () => {
                const res = {};

                let first = true;
                const stub = sinon.spy(() => {
                    if (first) {
                        first = false;
                        return Q.delay(1000);
                    } else {
                        return Q.resolve(res);
                    }
                });

                return wrapWithRetry(stub, { factor: 0.1, minTimeout: 1, errorAfterTimeout: 100 })
                    .then((result) => {
                        expect(result).to.equal(res);
                        expect(stub.callCount).to.equal(2);
                    });
            });

        });

        describe('negative', () => {

            it('should fail in case all retries failed', () => {
                const stub = sinon.stub();
                const error = new Error('my error');
                stub.rejects(error);
                return wrapWithRetry(stub, { factor: 0.1, minTimeout: 1 })
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.equal('Error: my error');
                        expect(stub.callCount).to.equal(61);
                    });
            });

        });

    });
});
