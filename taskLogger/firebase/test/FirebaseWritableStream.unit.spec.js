const FireBaseWritableStream = require('../step-streams/FirebaseWritableStream');
const StepNameTransformStream = require('../step-streams/StepNameTransformStream');
const { Readable } = require('stream');
// const sinon = require('sinon');
const { expect } =  require('chai');
const Q = require('q');

class FirebaseClientMock {
    child() { return this; }
    push() { return this; }
    key() { return Math.random().toString(36).substring(2); }
    update(data, callback) { callback(); }
}

const fireBaseWritableStreamOpts = Object.create({
    messageSizeLimitPerTimeUnit: 1 * 1024 * 1024, // 1 MB
    timeUnitLimitMs: 1000,
    batchSize: 5,
    debounceDelay: 500 // flush every 500 ms
});

const firebaseClientMock = new FirebaseClientMock();

describe('Firebase Writable Stream Tests', () => {

    let fireBaseWritableStream = new FireBaseWritableStream(firebaseClientMock, fireBaseWritableStreamOpts);
    // const sandbox = sinon.createSandbox();

    beforeEach(() => {
        fireBaseWritableStream = new FireBaseWritableStream(firebaseClientMock, fireBaseWritableStreamOpts);
    });

    afterEach(() => {
        fireBaseWritableStream.destroy();
        fireBaseWritableStream = undefined;
    });

    it('should successfully write message to logs batch', () => {
        const message = 'some fake str';
        const ts = `\u001b[36m[${new Date().toISOString()}]\u001b[0m`;
        const stepName = 'stepName';
        const stepNameSizeHeader = Buffer.alloc(1);
        const stepNameLengthHex = `0x${stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        const chunk = Buffer.concat([stepNameSizeHeader, Buffer.from(stepName), Buffer.from(message, 'utf8')]);
        fireBaseWritableStream._write(chunk, 'utf8', () => {});
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
        expect(fireBaseWritableStream._currentLogByteSize).to.be.equal(Buffer.byteLength(`${ts} ${message}`));
    });

    it('should successfully write messages to logs batch and flush to firebase', () => {
        for (let i = 0; i < fireBaseWritableStreamOpts.batchSize; i += 1) {
            fireBaseWritableStream._write(Buffer.from('some fake str', 'utf8'), 'utf8', () => {});
        }
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(0);
    });

/* it('should successfully flush to firebase after message size per unit time has exceeded', (done) => {
        const chunk = new Array(524288 / 2).fill('a').join(); // create 500k string
        console.log(Buffer.byteLength(chunk));
        let totalSize = 0;
        for (let i = 0; i < 3; i += 1) {
            totalSize += Buffer.byteLength(chunk);
            console.log(`total size: ${totalSize}/${fireBaseWritableStreamOpts.messageSizeLimitPerTimeUnit}`);
            fireBaseWritableStream._write(Buffer.from(chunk, 'utf8'), 'utf8', () => {
                expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
                done();
            });
        }
    }); */

    it('should successfully write message to logs batch and flush to firebase after debounce delay', (done) => {
        fireBaseWritableStream._write(Buffer.from('some fake str', 'utf8'), 'utf8', () => {});
        setTimeout(() => {
            expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(0);
            done();
        }, fireBaseWritableStreamOpts.debounceDelay + 10);
    });

    it('should emit flush event with the number of flushed writeCalls - _setBatchFlushTimeout', () => {
        const status = {
            writeCalls: 0,
            resolved: 0,
            rejected: 0,
        };

        const deferred = Q.defer();

        const stepNameStream = new StepNameTransformStream('step1');
        stepNameStream.on('writeCalls', () => { status.writeCalls += 1; });

        fireBaseWritableStream.on('flush', (err, nFlushed) => {
            expect(err).to.be.null;
            status.resolved += nFlushed;
            console.log(`flush called, nflushed:${nFlushed}`);
        });

        const mockReadableStream = new Readable({
            read() {
                this.push(Buffer.from('message1\n', 'utf-8'));
                this.push(Buffer.from('message2\n', 'utf-8'));
                this.push(null); // end readable stream
            }
        });

        mockReadableStream.pipe(stepNameStream).pipe(fireBaseWritableStream, { end: false });

        const checkResolved = () => {
            console.log(`called: ${JSON.stringify(status)}`);
            if (status.resolved + status.rejected === status.writeCalls) {
                deferred.resolve();
            }
        };

        stepNameStream.on('end', () => {
            checkResolved();
            fireBaseWritableStream.on('flush', checkResolved);
        });

        return deferred.promise;
    });

    it('should emit flush event with the number of flushed writeCalls - more than batch size', () => {
        const status = {
            writeCalls: 0,
            resolved: 0,
            rejected: 0,
        };

        const deferred = Q.defer();

        const stepNameStream = new StepNameTransformStream('step1');
        stepNameStream.on('writeCalls', () => { status.writeCalls += 1; });

        fireBaseWritableStream.on('flush', (err, nFlushed) => {
            expect(err).to.be.null;
            status.resolved += nFlushed;
            console.log(`flush called, nflushed: ${nFlushed}`);
        });

        const mockReadableStream = new Readable({
            read() {
                this.push(Buffer.from('message1\n', 'utf-8'));
                this.push(Buffer.from('message2\n', 'utf-8'));
                this.push(Buffer.from('message3\n', 'utf-8'));
                this.push(Buffer.from('message4\n', 'utf-8'));
                this.push(Buffer.from('message5\n', 'utf-8'));
                this.push(Buffer.from('message6\n', 'utf-8')); // this will be sent in a 2nd batch

                this.push(null); // end readable stream
            }
        });

        mockReadableStream.pipe(stepNameStream).pipe(fireBaseWritableStream, { end: false });

        const checkResolved = () => {
            console.log(`called: ${JSON.stringify(status)}`);
            if (status.resolved + status.rejected === status.writeCalls) {
                deferred.resolve();
            }
        };

        stepNameStream.on('end', () => {
            checkResolved();
            fireBaseWritableStream.on('flush', checkResolved);
        });

        return deferred.promise;
    });
});
