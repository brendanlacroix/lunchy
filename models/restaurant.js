module.exports = (function() {
  'use strict';

  /* Database integration */
  const db = require('nano')(process.env.COUCHDB_URL);

  const Restaurant = {

    checkForExisting : function(name, callback) {
      db.get(name, function(error, body) {
        if (error && error.error === 'not_found') {
          return callback(null, false);
        } else if (error) {
          return callback(error, null);
        }

        return callback(null, true);
      });
    },

    create : function(name, callback) {
      db.insert({ last_visited : null}, name, function(error, body) {
        return callback(error, body);
      });
    },

    list : function(callback) {
      db.list({ include_docs : true }, function(error, body) {
        if (error) {
          return callback(error, null);
        }

        callback(null, body.rows.map(function(doc) {
          return doc.key;
        }));
      });
    }

  };

  return Restaurant;

})();