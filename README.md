# Connect Marklogic

A session store for Connect backed by [MarkLogic](https://www.npmjs.com/package/marklogic).  Requires MarkLogic version >= 8 for its native JSON support and NodeJS client.

## Installation

    $ npm install connect-marklogic

### A note for Express 3.x users

In order to use the latest `connect-marklogic` you also have to use [`express-session`](https://github.com/expressjs/session) instead of the default connect `session` middleware.

    $ npm install express-session

Then follow the usage instructions below.

## Options

  A MarkLogic client is required.  An existing client can be passed directly using the `client` param or created for you using the `host` and optional `port` settings (port defaults to 8000).  Note that MarkLogic also requires a `username` and `password` fields when creating a client - these are not necessary if an existing client is provided.

  - `client` An existing client created using `marklogic.createDatabaseClient(opts)`
  - `user` A marklogic username (only required if client is not passed)
  - `password` The password for the marklogic user (only required if client is not passed)

The following additional params may be included:

  - `host` MarkLogic server hostname (defaults 127.0.0.1)
  - `port` MarkLogic server port number (defaults to 8000)
  - `collection` The name of the ML collection to use for created sessions (defaults to 'sessions')
  - `ttl` the max time to live for a cookie.  If the cookie has no expiration set it will be set to now + ttl (defaults to 1209600)

If `client` is not provided then a client will be created and all options will be passed to the MarkLogic `createDatabaseClient()` method directly.

## Usage

Pass the `express-session` store into `connect-marklogic` to create a `MarkLogic` constructor.

    var session = require('express-session');
    var MarkLogicStore = require('connect-marklogic')(session);

    app.use(session({
        store: new MarkLogicStore({ user: 'admin', password: 'admin' }),
        secret: 'enterprise nosql'
    }));

# License

  Apache 2.0
