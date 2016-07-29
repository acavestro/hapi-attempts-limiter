'use strict';

const Hapi = require('hapi');
const FakeRedis = require('fakeredis');

const server = new Hapi.Server();
server.connection();

server.route([
    {
        method: 'POST',
        path: '/test',
        handler: function (request, reply) {

            if (request.payload && request.payload.good) {
                return reply().code(200);
            }

            return reply().code(403);
        }
    }
]);

server.register({
    register: require('../index'),
    options: {
        redisClient: FakeRedis.createClient(),
        global: {
            duration: 1
        }
    }
});

module.exports = server;
