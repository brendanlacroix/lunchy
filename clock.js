/* global console, require, process */

module.exports = (function() {
  'use strict';

  require('dotenv').config({ silent : true });

  /* Slack integration */
  const Slack = require('slack-client');
  const token = process.env.SLACK_TOKEN;
  const autoReconnect = true;
  const autoMark = true;
  const slack = new Slack(token, autoReconnect, autoMark);

  const schedule = require('node-schedule');

  const restaurantHelpers = require('./restaurant_helpers.js');

  let rule = new schedule.RecurrenceRule(),
      job;

  rule.dayOfWeek = 5;
  rule.hour = 12;
  rule.minute = 00;

  job = schedule.scheduleJob(rule, function(){
    let channel;

    slack.on('open', function() {
      channel = slack.getChannelByName(process.env.AUTO_CHANNEL_NAME);

      restaurantHelpers.pick(function(error, restaurant) {
        channel.send('You\'re going to ' + restaurant.id + '! Woo! (I\'m marking this as visited, so if you don\'t go this week don\'t expect to see it pop up again soon...)');

        restaurantHelpers.updateLastVisited(restaurant, function(error, body) {
          if (error) {
            return console.error(error);
          }

          console.log('Updated last_visited of', restaurant.id);
        });
      });
    });

    slack.login();
  });
})();
