module.exports = (function() {
  'use strict';

  const _ = require('lodash');

  /* Database integration */
  const db = require('nano')(process.env.COUCHDB_URL);

  const restaurantHelpers = {

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

    updateLastVisited : function(restaurant, callback) {
      db.insert({ _id : restaurant.doc._id, _rev : restaurant.doc._rev, last_visited : new Date() }, { include_docs : true }, function(error, body) {
        callback(error, body);
      });
    },

    pick : function(callback) {
      db.list({ include_docs : true }, function(error, body) {
        var restaurants,
            unvisited,
            unrecent,
            options,
            choice;

        if (error) {
          return callback(error, null);
        }

        restaurants = body.rows;

        unvisited = _.filter(restaurants, restaurant => (!restaurant.doc.last_visited));

        unrecent = _.difference(restaurants, unvisited);
        unrecent = _.sortBy(unrecent, restaurant => (restaurant.doc.last_visited));

        unrecent = _.reject(unrecent, function(restaurant) {
          return _.indexOf(unrecent, restaurant) > Math.min(unrecent.length / 3) - 1;
        });

        if (unvisited.length) {
          options = unvisited;
        } else {
          options = unrecent;
        }

        choice = _.sample(options);

        callback(null, choice);
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

  return restaurantHelpers;

})();