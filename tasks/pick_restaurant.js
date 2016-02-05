module.exports = (function() {

  'use strict';

  const Nodal = require('nodal');
  const _ = require('lodash');

  const Restaurant = Nodal.require('app/models/restaurant.js');
  const slack = Nodal.require('tasks/helpers/slack.js');

  let channel;

  slack.on('open', function() {
    var channels = Object.keys(slack.channels)
          .map(function (k) { return slack.channels[k]; })
          .filter(function (c) { return c.is_member; })
          .map(function (c) { return c.name; }),
        channelName;

    channelName = _.last(channels);

    if (channelName === 'general') {
      throw new Error('Lunchy doesn\'t work in the general channel. Try adding it to another one!');
    }

    channel = slack.getChannelByName(channelName);

    console.log('Reporting to', channelName);
  });

  class PickRestaurant extends Nodal.SchedulerTask {

    exec(app, args, callback) {

      console.log('Picking a restaurant...');

      Restaurant.query()
        .where({ id__gte : 0 })
        .end((err, models) => {
          var unvisited,
              unrecentRestaurants,
              options,
              choice;

          if (!models.length) {
            return;
          }

          unvisited = _.filter(models, restaurant => (!restaurant.get('last_visited')));

          unrecentRestaurants = _.difference(models, unvisited);
          unrecentRestaurants = _.sortBy(unrecentRestaurants, function(restaurant) {
            return restaurant.get('last_visited');
          });

          // var optionsString = unrecentRestaurants.map(function(restaurant) {
          //   return restaurant.get('name');
          // }).join(', ');

          // console.log('Visit order: ' + optionsString);

          unrecentRestaurants = _.reject(unrecentRestaurants, function(restaurant) {
            return _.indexOf(unrecentRestaurants, restaurant) > Math.min(unrecentRestaurants.length / 3) - 1;
          });

          if (unvisited.length) {
            options = unvisited;
          } else {
            options = unrecentRestaurants;
          }

          // optionsString = options.map(function(restaurant) {
          //   return restaurant.get('name');
          // }).join(', ');

          // console.log('Choosing from: ' + optionsString);

          choice = _.sample(options);

          choice.set('last_visited', new Date());
          choice.save(() => {
            console.log('We\'re going to ' + choice.get('name') + '! Marking its last_visited at ' + choice.get('last_visited'));

            if (channel) {
              channel.send('We\'re going to ' + choice.get('name') + '!');
            }

            console.log('========');

            callback();
          });

        });

    }

  }

  return PickRestaurant;

})();
