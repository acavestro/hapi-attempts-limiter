# hapi-attempts-limiter

![TravisCI build status](https://travis-ci.org/acavestro/hapi-attempts-limiter.svg?branch=master)

An hapi.js plugin that limits the number of failed attempts, based on IP and called route,
using Redis to store attempts count. Useful for preventing brute force attacks.

## Installation

```
npm install --save hapi-attempts-limiter
```

## Usage

You need to register the plugin in you hapi server instance, providing some configuration attributes:

* **redisClient**: an instance of Redis
* **namespace**: a prefix for the items saved to Redis by the plugin (optional)
* **global.limit**: the number of maximum failed attempts in the current time window (default: 5)
* **global.duration**: the length of the time window in **seconds** (default: 60 seconds)

```javascript
server.register({
  register: require('hapi-attempts-limiter'),
  options: {
    namespace: 'FOO',
    redisClient: yourRedisInstance
    global: {
      limit: 5,
      duration: 60
    }
  }
});
```

Starting from the first failed attempt, the plugin will exposed three headers:
- **X-RateLimit-Limit**: the number of maximum failed attempts in the current time window
- **X-RateLimit-Remaining**: the number of remaining failed attempts in the current time window
- **X-RateLimit-Reset**: the seconds until the expiration of the current time window

### CORS

If you are working with cross-domain requests using [CORS](http://www.w3.org/TR/cors/) protocol and you want to access
X-RateLimit-* headers from your client, you have to expose them by adjusting the route configuration (or the global one):

```javascript
cors: {
    origin: ['*'],
    additionalExposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}
```

### Route custom settings

Additionally, you can define for every route a custom limit and a custom duration. You just need to add some parameters
to your route configuration object:

```javascript
{
  method: 'POST',
  path: '/login',
  handler: loginUser,
  config: {
    description: 'User login route',
    plugins: {
      "hapi-attempts-limiter": {
          limit: 3, // a custom limit
          duration: 120 // a custom duration, in seconds
      }
    }
  }
}
```
Happy coding!
