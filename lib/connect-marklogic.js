

/*!
 * connect-marklogic
 * Apache 2.0
 */

/**
 * Module dependencies
 */
var crypto = require('crypto');
var util = require('util');
var debug = require('debug')('connect-marklogic');
var marklogic = require('marklogic');

/**
 * Default options
 */
var defaultOptions = {
  host: '127.0.0.1',
  user: 'admin',
  password: 'admin',
  collection: 'sessions',
  ssl: false,
  w: 1,
  defaultExpirationTime:  1000 * 60 * 60 * 24 * 14 // 14 days
};

function defaultSerializer (session) {
  // Copy each property of the session to a new object
  var obj = {};
  for (var prop in session) {
    if (prop === 'cookie') {

    // Convert the cookie instance to an object, if possible
    // This gets rid of the duplicate object under session.cookie.data property

      obj.cookie = session.cookie.toJSON ? session.cookie.toJSON() : session.cookie;
    } else {
      obj[prop] = session[prop];
    }
  }

  return obj;
}

function mlDocument(doc) { return doc.content; }

module.exports = function(connect) {
  var Store = connect.Store || connect.session.Store;

  /**
   * Initialize MongoStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function MarkLogicStore(options) {
    options = options || {};
    var collectionName = options.collection || defaultOptions.collection;
    this.baseUri = options.baseUri || encodeURI(collectionName.replace(/\s/g,'-'));

    Store.call(this, options);

    // Hash sid
    if (options.hash) {
      var defaultSalt = 'connect-marklogic';
      var defaultAlgorithm = 'sha1';
      this.hash = {};
      this.hash.salt = options.hash.salt ? options.hash.salt : defaultSalt;
      this.hash.algorithm = options.hash.algorithm ? options.hash.algorithm : defaultAlgorithm;
    }

    // Serialization
    if (options.stringify || (!('stringify' in options) && !('serialize' in options) && !('unserialize' in options))) {
      this.serializeSession = JSON.stringify;
      this.unserializeSession = JSON.parse;
    } else {
      this.serializeSession = options.serialize || defaultSerializer;
      this.unserializeSession = options.unserialize || mlDocument;
    }

    // Expiration time
    this.defaultExpirationTime = options.defaultExpirationTime || defaultOptions.defaultExpirationTime;

    var self = this;

    self.collectionName = collectionName;
    self.db = marklogic.createDatabaseClient(options);

  }

  /**
   * Inherit from `Store`.
   */
   util.inherits(MarkLogicStore, Store);

   /**
     *  Wrapper for sending ML data back in standard callback(err,data) format
     */
   function documentsCallback(callback,max) {
    // TODO implement session expiration code
    return function(documents) {
      if (documents && documents.length) {
        if (max && documents.length >= max) {
          documents = max === 1 ? documents[0] : documents.slice(0,max);
        }
        console.log('returning documents',documents);
        callback(null,documents);
      }
      callback();
    };
   }

   function writeCallback(callback) {
    return function(response) {
      callback(null, JSON.stringify(response));
    };
   }

  function getDocumentUri(sid, baseUri) {
    return '/' + baseUri + '/' + sid + '.json';
  }

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */
  MarkLogicStore.prototype.get = function(sid, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    this.db.read(getDocumentUri(sid, this.baseUri)).result(documentsCallback(callback,1)).catch(callback);

  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.set = function(sid, session, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    var s;
    try {
      s = { sid: sid, session: this.serializeSession(session)};
    } catch (err) {
      debug('unable to serialize session');
      callback(err);
    }

    if (session && session.cookie && session.cookie.expires) {
      s.expires = new Date(session.cookie.expires);
    } else {
      // If there's no expiration date specified, it is
      // browser-session cookie or there is no cookie at all,
      // as per the connect docs.
      //
      // So we set the expiration to two-weeks from now
      // - as is common practice in the industry (e.g Django) -
      // or the default specified in the options.
      var today = new Date();
      s.expires = new Date(today.getTime() + this.defaultExpirationTime);
    }

    this.db.documents.write({ uri: getDocumentUri(sid, this.baseUri), collections: [ this.collectionName ], content: s}).result(writeCallback(callback));

  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.destroy = function(sid, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    var q = marklogic.queryBuilder;
    this.db.documents.remove(getDocumentUri(sid,this.baseUri)).result().then(function() { callback(); }).catch(callback);
  };

  /**
   * Fetch number of sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.length = function(callback) {
    var q = marklogic.queryBuilder;
    this.db.documents.count(q.collection(this.collectionName)).result(documentsCallback(callback));
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.clear = function(callback) {
    this.db.documents.removeAll({ collection: this.collectionName }).result().then(writeCallback(callback)).catch(callback);
  };

  return MarkLogicStore;
};