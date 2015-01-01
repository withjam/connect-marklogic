/*!
 * connect-marklogic
 * License: Apache 2.0
 * Author: Matt Pileggi <matt.pileggi@marklogic.com>
 */

/**
 * Module dependencies
 */
var util = require('util');
var debug = require('debug')('connect-marklogic');
var marklogic = require('marklogic');

/**
 * Default options
 */
var defaultOptions = {
  host: '127.0.0.1',
  port: 8000,
  collection: 'sessions',
  ttl: 1209600
};

module.exports = function(connect) {
  var Store = connect.Store || connect.session.Store;

  /**
   * Initialize MarkLogicStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function MarkLogicStore(options) {
    options = options || {};
    var collectionName = options.collection || defaultOptions.collection;
    this.baseUri = options.baseUri || encodeURI(collectionName.replace(/\s/g,'-'));

    Store.call(this, options);

    this.collectionName = collectionName;
    this.ttl =  options.ttl;

    // retain the client that was passed in, or create a new client
    this.db = options.client || marklogic.createDatabaseClient(options);

  }

  /**
   * Inherit from `Store`.
   */
   util.inherits(MarkLogicStore, Store);


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
    this.db
      .read(getDocumentUri(sid, this.baseUri))
      .result(function(docs) {
        if (docs && docs.length) {
          callback(null, JSON.parse(docs[0].session));
        } else {
          callback();
        }
      })
      .catch(callback);
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.set = function(sid, sess, callback) {
    var s = { sid: sid, session: JSON.stringify(sess) };

    if (sess && sess.cookie && sess.cookie.expires) {
      s.expires = new Date(sess.cookie.expires);
    } else {
      // set a 2-week expiration date if none set
      var today = new Date();
      s.expires = new Date(today.getTime() + this.ttl);
    }

    debug('marklogic setting session %s', s);
    this.db.documents
      .write({ uri: getDocumentUri(sid, this.baseUri), collections: [ this.collectionName ], content: s})
      .result(function(data) { 
        debug('got result from ml %s', data); 
        callback(); 
      })
      .catch(function() { 
        debug('there was an error %s', arguments); 
        callback('could not save'); 
      });
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.destroy = function(sid, callback) {
    debug('destroing session %s', sid);
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
    debug('getting length of collection %s', this.collectionName);
    this.db.documents.count(q.collection(this.collectionName)).result(function(data) { callback(null,data); }).catch(callback);
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MarkLogicStore.prototype.clear = function(callback) {
    debug('clearing all %s', this.collectionName);
    this.db.documents
      .removeAll({ collection: this.collectionName })
      .result()
      .then(function() { callback(); })
      .catch(callback);
  };

  return MarkLogicStore;
};
