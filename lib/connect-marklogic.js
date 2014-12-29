

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

function mlDocument(doc) { return doc.session || doc.content || doc; }

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
   function documentsCallback(callback,single) {
    // TODO implement session expiration code
    return function(documents) {
      if (documents) {
        if (single && documents.length) {
          console.log('getting single session', documents[0]);
          documents = documents[0].session;
        }
        console.log(typeof documents);
        callback(null,documents);
      }
      callback();
    };
   }

   function writeCallback(callback) {
    return function() {
      callback(null);
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
    this.db.read(getDocumentUri(sid, this.baseUri)).result(documentsCallback(callback,true)).catch(callback);

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
    var s = { sid: sid, session: this.serializeSession(session) };
    console.log('setting session ', sid);

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

    this.db.documents.write({ uri: getDocumentUri(sid, this.baseUri), collections: [ this.collectionName ], content: s}).result(writeCallback(callback)).catch(callback);

  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.destroy = function(sid, callback) {
    console.log('destroing session ', sid);
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
    console.log('getting length of collection', this.collectionName);
    this.db.documents.count(q.collection(this.collectionName)).result(function(data) { callback(null,data); }).catch(callback);
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.clear = function(callback) {
    console.log('clearing all ', this.collectionName);
    this.db.documents.removeAll({ collection: this.collectionName }).result().then(writeCallback(callback)).catch(callback);
  };

  return MarkLogicStore;
};