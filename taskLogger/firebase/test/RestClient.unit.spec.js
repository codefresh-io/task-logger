const nock = require('nock');
const chai       = require('chai');

const { expect } = chai;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const RestClient = require('../rest/Client');

const restClientOptions = {
    isPlatform: true,
    firebaseIdToken: 'mockIdToken',
};
let httpClient;

describe('Firebase rest Client', () => {

    before(async () => {
        // eslint-disable-next-line import/no-unresolved
        const { default: got } = await import('got');
        httpClient = got.extend({
            retry: { backoffLimit: 10 },
        });
    });

    beforeEach(() => {
        nock.cleanAll();
    });

    describe('retries', () => {

        describe('positive', () => {
            it.skip('should perform retry in case of rate limit error', () => {});

            [
                502,
                504,
            ].forEach((statusCode) => {
                it(`should perform retry in case of network error with status ${statusCode}`, async () => {
                    const response = {
                        body: {
                            key: 'val'
                        }
                    };

                    const scope1 = nock('http://firebase.com', {
                        reqheaders: {
                            'user-agent': 'codefresh-task-logger',
                            'host': 'firebase.com',
                            'accept': 'application/json'
                        },
                    })
                        .get('/path.json')
                        .query({ auth: restClientOptions.firebaseIdToken })
                        .reply(statusCode, 'network error');

                    const scope2 = nock('http://firebase.com', {
                        reqheaders: {
                            'user-agent': 'codefresh-task-logger',
                            'host': 'firebase.com',
                            'accept': 'application/json'
                        },
                    })
                        .get('/path.json')
                        .query({ auth: restClientOptions.firebaseIdToken })
                        .reply(200, response);

                    const restClient = new RestClient(httpClient, restClientOptions);
                    const uri = 'http://firebase.com/path';
                    const qs = {};
                    const opts = { inOrder: true };
                    const data = await restClient.get(uri, qs, opts);
                    expect(data).to.deep.equal(response);
                    expect(scope1.isDone()).to.equal(true);
                    expect(scope2.isDone()).to.equal(true);
                });
            });

        });

        describe('negative', () => {
            it('should not perform retry in case of non recognized error', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const scope1 = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(400, 'network error');

                const scope2 = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(200, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                try {
                    await restClient.get(uri, qs, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(scope1.isDone()).to.equal(true);
                    expect(scope2.isDone()).to.equal(false);
                }
            });

            it('should fail in case all 5 retires failed', async () => {
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .times(5)
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(502, 'network error');

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                try {
                    await restClient.get(uri, qs, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(scope.isDone()).to.equal(true);
                }
            });

        });

    });

    describe('operations', () => {

        describe('positive', () => {

            it('get', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(200, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                const data = await restClient.get(uri, qs, opts);
                expect(data).to.deep.equal(response);
                expect(scope.isDone()).to.equal(true);
            });

            it('set', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const data = {
                    key2: 'val2'
                };
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'content-length': 15
                    }
                })
                    .put('/path.json', data)
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(200, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const dataSetSpy = sinon.spy();
                restClient.on('data-set-successfully', dataSetSpy);

                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                await restClient.set(uri, data, opts);
                expect(dataSetSpy).to.have.been.calledOnce;
                expect(scope.isDone()).to.equal(true);
            });

            it('remove', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                    }
                })
                    .delete('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(200, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                await restClient.remove(uri, opts);
                expect(scope.isDone()).to.equal(true);
            });

            it('push', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const data = {
                    key2: 'val2'
                };
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'content-length': 15
                    }
                })
                    .post('/path.json', data)
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(200, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                await restClient.push(uri, data, opts);
                expect(scope.isDone()).to.equal(true);
            });
        });

        describe('negative', () => {

            it('get', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(400, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                try {
                    await restClient.get(uri, qs, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(scope.isDone()).to.equal(true);
                }
            });

            it('set', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const data = {
                    key2: 'val2'
                };
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'content-length': 15
                    }
                })
                    .put('/path.json', data)
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(400, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const dataSetSpy = sinon.spy();
                restClient.on('data-set-successfully', dataSetSpy);

                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                try {
                    await restClient.set(uri, data, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(dataSetSpy).to.not.have.been.called;
                    expect(scope.isDone()).to.equal(true);
                }
            });

            it('remove', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                    }
                })
                    .delete('/path.json')
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(400, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                try {
                    await restClient.remove(uri, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(scope.isDone()).to.equal(true);
                }
            });

            it('push', async () => {
                const response = {
                    body: {
                        key: 'val'
                    }
                };

                const data = {
                    key2: 'val2'
                };
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'content-length': 15
                    }
                })
                    .post('/path.json', data)
                    .query({ auth: restClientOptions.firebaseIdToken })
                    .reply(400, response);

                const restClient = new RestClient(httpClient, restClientOptions);
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                try {
                    await restClient.push(uri, data, opts);
                    throw new Error('should have failed');
                } catch (error) {
                    expect(error.toString()).to.contain('Failed to perform HTTP request');
                    expect(scope.isDone()).to.equal(true);
                }
            });

        });
    });

    describe('order of http request execution', () => {

        it('should perform operations in order in case of inOrder: true', async () => {
            const response = {
                body: {
                    key: 'val'
                }
            };

            const scope1 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path1.json')
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const scope2 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path2.json')
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const scope3 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path3.json')
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const restClient = new RestClient(httpClient, restClientOptions);
            const uri = 'http://firebase.com/path';
            const qs = {};
            const opts = { inOrder: true };

            const finalScopesOrder = [];

            const promise1 = restClient.get(`${uri}1`, qs, opts)
                .then(() => {
                    finalScopesOrder.push(scope1);
                });

            const promise2 = restClient.get(`${uri}2`, qs, opts)
                .then(() => {
                    finalScopesOrder.push(scope2);
                });

            const promise3 = restClient.get(`${uri}3`, qs, opts)
                .then(() => {
                    finalScopesOrder.push(scope3);
                });

            await Promise.all([promise1, promise2, promise3]);
            expect(finalScopesOrder[0]).to.equal(scope1);
            expect(finalScopesOrder[1]).to.equal(scope2);
            expect(finalScopesOrder[2]).to.equal(scope3);
        });

        it('should perform third request which is (inOrder: false) before performing second operation which is (inOrder: true)', async () => {
            const response = {
                body: {
                    key: 'val'
                }
            };

            const scope1 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path1.json')
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const scope2 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path2.json')
                .delay(50)
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const scope3 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path3.json')
                .query({ auth: restClientOptions.firebaseIdToken })
                .reply(200, response);

            const restClient = new RestClient(httpClient, restClientOptions);
            const uri = 'http://firebase.com/path';
            const qs = {};
            const opts = { inOrder: true };

            const finalScopesOrder = [];

            const promise1 = restClient.get(`${uri}1`, qs, opts)
                .then(() => {
                    finalScopesOrder.push(scope1);
                });

            const promise2 = restClient.get(`${uri}2`, qs, opts)
                .then(() => {
                    finalScopesOrder.push(scope2);
                });

            const promise3 = restClient.get(`${uri}3`, qs, { inOrder: false })
                .then(() => {
                    finalScopesOrder.push(scope3);
                });

            await Promise.all([promise1, promise2, promise3]);
            expect(finalScopesOrder[0]).to.equal(scope1);
            expect(finalScopesOrder[1]).to.equal(scope3);
            expect(finalScopesOrder[2]).to.equal(scope2);
        });

    });

});
