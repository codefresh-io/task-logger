const nock = require('nock');
const chai       = require('chai');

const expect     = chai.expect;
const sinon      = require('sinon');
const sinonChai  = require('sinon-chai');

chai.use(sinonChai);
const RestClient = require('../rest/Client');

describe('Firebase rest Client', () => {

    beforeEach(() => {
        nock.cleanAll();
    });

    describe('retries', () => {

        describe('positive', () => {
            it.skip('should perform retry in case of rate limit error', () => {});

            it('should perform retry in case of network error', () => {
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
                    .query({ auth: 'secret' })
                    .reply(502, 'network error');

                const scope2 = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                return restClient.get(uri, qs, opts)
                    .then((data) => {
                        expect(data).to.deep.equal(response);
                        expect(scope1.isDone()).to.equal(true);
                        expect(scope2.isDone()).to.equal(true);
                    });
            });

        });

        describe('negative', () => {
            it('should not perform retry in case of non recognized error', () => {
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
                    .query({ auth: 'secret' })
                    .reply(400, 'network error');

                const scope2 = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                return restClient.get(uri, qs, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Error: Failed to write to http://firebase.com/path.json');
                        expect(scope1.isDone()).to.equal(true);
                        expect(scope2.isDone()).to.equal(false);
                    });
            });

            it('should fail in case all 5 retires failed', () => {
                const scope = nock('http://firebase.com', {
                    reqheaders: {
                        'user-agent': 'codefresh-task-logger',
                        'host': 'firebase.com',
                        'accept': 'application/json'
                    },
                })
                    .get('/path.json')
                    .times(5)
                    .query({ auth: 'secret' })
                    .reply(502, 'network error');

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                return restClient.get(uri, qs, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Error: Failed to write to http://firebase.com/path.json');
                        expect(scope.isDone()).to.equal(true);
                    });
            });

        });

    });

    describe('operations', () => {

        describe('positive', () => {

            it('get', () => {
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
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                return restClient.get(uri, qs, opts)
                    .then((data) => {
                        expect(data).to.deep.equal(response);
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('set', () => {
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
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const dataSetSpy = sinon.spy();
                restClient.on('data-set-successfully', dataSetSpy);

                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.set(uri, data, opts)
                    .then(() => {
                        expect(dataSetSpy).to.have.been.calledOnce;
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('remove', () => {
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
                        'content-length': 0
                    }
                })
                    .delete('/path.json')
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.remove(uri, opts)
                    .then(() => {
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('push', () => {
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
                    .query({ auth: 'secret' })
                    .reply(200, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.push(uri, data, opts)
                    .then(() => {
                        expect(scope.isDone()).to.equal(true);
                    });
            });
        });

        describe('negative', () => {

            it('get', () => {
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
                    .query({ auth: 'secret' })
                    .reply(400, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';
                const qs = {};
                const opts = { inOrder: true };
                return restClient.get(uri, qs, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Failed to write to http://firebase.com/path.json');
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('set', () => {
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
                    .query({ auth: 'secret' })
                    .reply(400, response);

                const restClient = new RestClient('secret');
                const dataSetSpy = sinon.spy();
                restClient.on('data-set-successfully', dataSetSpy);

                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.set(uri, data, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Failed to write to http://firebase.com/path.json');
                        expect(dataSetSpy).to.not.have.been.called;
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('remove', () => {
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
                        'content-length': 0
                    }
                })
                    .delete('/path.json')
                    .query({ auth: 'secret' })
                    .reply(400, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.remove(uri, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Failed to write to http://firebase.com/path.json');
                        expect(scope.isDone()).to.equal(true);
                    });
            });

            it('push', () => {
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
                    .query({ auth: 'secret' })
                    .reply(400, response);

                const restClient = new RestClient('secret');
                const uri = 'http://firebase.com/path';

                const opts = { inOrder: true };
                return restClient.push(uri, data, opts)
                    .then(() => {
                        throw new Error('should have failed');
                    }, (err) => {
                        expect(err.toString()).to.contain('Failed to write to http://firebase.com/path.json');
                        expect(scope.isDone()).to.equal(true);
                    });
            });

        });
    });

    describe('order of http request execution', () => {

        it('should perform operations in order in case of inOrder: true', () => {
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
                .query({ auth: 'secret' })
                .reply(200, response);

            const scope2 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path2.json')
                .query({ auth: 'secret' })
                .reply(200, response);

            const scope3 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path3.json')
                .query({ auth: 'secret' })
                .reply(200, response);

            const restClient = new RestClient('secret');
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

            return Promise.all([promise1, promise2, promise3])
                .then(() => {
                    expect(finalScopesOrder[0]).to.equal(scope1);
                    expect(finalScopesOrder[1]).to.equal(scope2);
                    expect(finalScopesOrder[2]).to.equal(scope3);
                });
        });

        it('should perform third request which is (inOrder: false) before performing second operation which is (inOrder: true)', () => {
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
                .query({ auth: 'secret' })
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
                .query({ auth: 'secret' })
                .reply(200, response);

            const scope3 = nock('http://firebase.com', {
                reqheaders: {
                    'user-agent': 'codefresh-task-logger',
                    'host': 'firebase.com',
                    'accept': 'application/json'
                },
            })
                .get('/path3.json')
                .query({ auth: 'secret' })
                .reply(200, response);

            const restClient = new RestClient('secret');
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

            return Promise.all([promise1, promise2, promise3])
                .then(() => {
                    expect(finalScopesOrder[0]).to.equal(scope1);
                    expect(finalScopesOrder[1]).to.equal(scope3);
                    expect(finalScopesOrder[2]).to.equal(scope2);
                });
        });

    });

});
