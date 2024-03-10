const { Readable } = require('stream');
const chai = require('chai');
const Q = require('q');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const StepNameTransformStream = require('../step-streams/StepNameTransformStream');
const FireBaseWritableStream = require('../step-streams/FirebaseWritableStream');

const { expect } = chai;

chai.use(sinonChai);

const fireBaseWritableStreamOpts = Object.create({
    messageSizeLimitPerTimeUnit: 1 * 1024 * 1024, // 1 MB
    timeUnitLimitMs: 1000,
    batchSize: 5,
    debounceDelay: 500, // flush every 500 ms
    flushTimeLimitMs: 700,
});

describe('Firebase Writable Stream Tests', () => {
    let fireBaseWritableStream;
    let firebaseClientMock;

    beforeEach(() => {
        firebaseClientMock = {
            child() { return this; },
            push() { return this; },
            key() { return Math.random().toString(36).substring(2); },
            update: sinon.spy((data, callback) => { callback(); }),
        };
        fireBaseWritableStream = new FireBaseWritableStream(firebaseClientMock, fireBaseWritableStreamOpts);
    });

    afterEach(() => {
        fireBaseWritableStream.destroy();
        fireBaseWritableStream = undefined;
    });

    it('should successfully write message to logs batch', () => {
        const message = 'some fake str';
        const stepName = 'stepName';
        const stepNameSizeHeader = Buffer.alloc(1);
        const stepNameLengthHex = `0x${stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        const chunk = Buffer.concat([stepNameSizeHeader, Buffer.from(stepName), Buffer.from(message, 'utf8')]);
        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(Buffer.byteLength(message));
    });

    it('should successfully write messages to logs batch and flush to firebase', () => {
        const stepName = 'stepName';
        const stepNameSizeHeader = Buffer.alloc(1);
        const stepNameLengthHex = `0x${stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        for (let i = 0; i < (fireBaseWritableStreamOpts.batchSize * 2) + 1; i += 1) {
            expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(i % fireBaseWritableStreamOpts.batchSize);
            const chunk = Buffer.concat([stepNameSizeHeader, Buffer.from(stepName), Buffer.from('some fake str', 'utf8')]);
            fireBaseWritableStream._write(chunk, 'utf8', () => { });
        }
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
        expect(firebaseClientMock.update).to.have.been.calledTwice;
    });

    it('should flush log batch if debounceDelay has passed', async () => {
        const message = 'some fake str';
        const stepName = 'stepName';
        const stepNameSizeHeader = Buffer.alloc(1);
        const stepNameLengthHex = `0x${stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        const chunk = Buffer.concat([
            stepNameSizeHeader,
            Buffer.from(stepName),
            Buffer.from(message, 'utf8'),
        ]);

        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(Buffer.byteLength(message));

        await Q.delay(fireBaseWritableStreamOpts.debounceDelay);
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(0);
        expect(firebaseClientMock.update).to.have.been.calledOnce;
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(0);

    });

    it('should flush log batch if flushTimeLimitMs has passed', async () => {
        const message = 'some fake str';
        const stepName = 'stepName';
        const stepNameSizeHeader = Buffer.alloc(1);
        const stepNameLengthHex = `0x${stepName.length.toString(16)}`;
        stepNameSizeHeader.writeUInt8(stepNameLengthHex, 0);

        const chunk = Buffer.concat([
            stepNameSizeHeader,
            Buffer.from(stepName),
            Buffer.from(message, 'utf8'),
        ]);

        // write 1
        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(1);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(Buffer.byteLength(message));
        await Q.delay(300);

        // write 2
        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(2);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(Buffer.byteLength(message) * 2);
        await Q.delay(300);

        // write 3
        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(3);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(Buffer.byteLength(message) * 3);
        await Q.delay(300);

        // even though there is more space in batch and we reset debounce delay
        // we expect this next chunk to cause flush because we ran out of time
        // and don't want to old the batch for more than flushTimeLimitMs
        fireBaseWritableStream._write(chunk, 'utf8', () => { });
        expect(firebaseClientMock.update).to.have.been.calledOnce;
        expect(Object.keys(fireBaseWritableStream._logsBatch).length).to.be.equal(0);
        expect(fireBaseWritableStream._currentBatchSize).to.be.equal(0);
    });

    it('should successfully write message to logs batch and flush to firebase after debounce delay', (done) => {
        fireBaseWritableStream._write(Buffer.from('some fake str', 'utf8'), 'utf8', () => { });
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
        const checkResolved = () => {
            console.log(`called: ${JSON.stringify(status)}`);
            if (status.resolved + status.rejected === status.writeCalls) {
                deferred.resolve();
            }
        };

        fireBaseWritableStream.on('writeCalls', () => { status.writeCalls += 1; });
        fireBaseWritableStream.on('flush', (err, logSize) => {
            status.resolved += 1;
            expect(err).to.be.null;
            expect(logSize).to.equal(18); // two 9 byte messages
            checkResolved();
        });

        const mockReadableStream = new Readable({
            read() {
                this.push(Buffer.from('message1\n', 'utf-8'));
                this.push(Buffer.from('message2\n', 'utf-8'));
                this.push(null); // end readable stream
            }
        });

        mockReadableStream.pipe(stepNameStream).pipe(fireBaseWritableStream, { end: false });

        return deferred.promise;
    });

    it('should emit flush event with the correct log size', () => {
        const status = {
            writeCalls: 0,
            resolved: 0,
            rejected: 0,
        };

        let flushCalls = 0;
        const deferred = Q.defer();
        const checkResolved = () => {
            console.log(`called: ${JSON.stringify(status)}`);
            if (status.resolved + status.rejected === status.writeCalls) {
                deferred.resolve();
            }
        };

        const stepNameStream = new StepNameTransformStream('step1');
        fireBaseWritableStream.on('writeCalls', () => { status.writeCalls += 1; });
        fireBaseWritableStream.on('flush', (err, logSize) => {
            flushCalls += 1;
            status.resolved += 1;
            expect(err).to.be.null;
            if (status.resolved === 1) {
                expect(logSize).to.equal(45); // 5 first msgs * 9 bytes size per msg
            } else {
                expect(logSize).to.equal(9); // last 9 byte message
            }
            if (flushCalls === 2) {
                checkResolved();
            }
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

        return deferred.promise;
    });
});
