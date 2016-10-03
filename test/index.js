'use strict';

const FakeRedis = require('fakeredis');
const Code = require('code');
const Lab = require('lab');
const Async = require('async');

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const afterEach = lab.afterEach;

const fail = Code.fail;
const expect = Code.expect;

const serverOptions = {
    method: 'POST',
    url: '/test'
};

const redisInstance = FakeRedis.createClient({ fast: true });
const Server = require('./testServer')(redisInstance);

const testOk = function (index, callback) {

    serverOptions.payload = {
        good: true
    };

    Server.inject(serverOptions, (response) => {

        return callback(null, response.statusCode);
    });
};

const testErr = function (index, callback) {

    if (serverOptions.payload) {
        delete serverOptions.payload;
    }

    Server.inject(serverOptions, (response) => {

        return callback(null, response.statusCode);
    });
};

describe('hapi-attempts-limiter', () => {

    afterEach((done) => {

        redisInstance.flushdb();
        return done();
    });

    it('should permit 5 error calls in one second', (done) => {

        Async.timesSeries(5, testErr, (err, results) => {

            if (err) {
                fail(err);
            }

            expect(results).to.be.equal([403, 403, 403, 403, 403]);

            return done();
        });
    });

    it('should return 429 after 5 error calls in one second', (done) => {

        Async.timesSeries(6, testErr, (err, results) => {

            if (err) {
                fail(err);
            }

            expect(results).to.be.equal([403, 403, 403, 403, 403, 429]);
            return done();
        });
    });

    it('should permit call after one second from the latest error call', (done) => {

        Async.timesSeries(6, testErr, (err, results) => {

            if (err) {
                fail(err);
            }

            expect(results).to.be.equal([403, 403, 403, 403, 403, 429]);

            setTimeout(() => {

                testErr(0, (err, statusCode) => {

                    if (err) {
                        fail(err);
                    }

                    expect(statusCode).to.be.equal(403);
                    return done();
                });
            }, 1050);
        });
    });

    it('should not decrease the remaining call counter in case of a "good" call', (done) => {

        Async.timesSeries(4, testErr, (err, results) => {

            if (err) {
                fail(err);
            }

            expect(results).to.be.equal([403, 403, 403, 403]);

            testOk(0, (err, statusCode) => {

                if (err) {
                    fail(err);
                }

                expect(statusCode).to.be.equal(200);

                Async.timesSeries(2, testErr, (err, secondResults) => {

                    if (err) {
                        fail(err);
                    }

                    expect(secondResults).to.be.equal([403, 429]);
                    return done();
                });
            });
        });
    });
});
