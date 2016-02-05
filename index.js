/* global console, require, process */

module.exports = (function() {
  'use strict';

  require('dotenv').config();

  const _ = require('lodash');

  /* Slack integration */
  const Slack = require('slack-client');
  const token = process.env.SLACK_TOKEN;
  const autoReconnect = true;
  const autoMark = true;
  const slack = new Slack(token, autoReconnect, autoMark);

  /* Foursquare integration */
  const Foursquare = require('foursquare-venues');
  const foursquare = new Foursquare(process.env.FOURSQUARE_ID, process.env.FOURSQUARE_SECRET);

  const Restaurant = require('./models/restaurant.js');

  let exchanges = {};

  slack.on('open', function() {
    var channels = Object.keys(slack.channels)
          .map(function (k) { return slack.channels[k]; })
          .filter(function (c) { return c.is_member; })
          .map(function (c) { return c.name; });

    console.log('Welcome to Slack. You are ' + slack.self.name + ' of ' + slack.team.name);

    if (channels.length > 0) {
      console.log('You are in: ' + channels.join(', '));
    }
  });

  class Exchange {
    constructor(message) {
      this._userID = message.user;
      this._username = slack.getUserByID(message.user).name;
      this._channel = slack.getChannelGroupOrDMByID(message.channel);

      /* Stages of exchange */
      this._findingRestaurant = true;
      this._confirmingRestaurant = false;
      this._extendedConfirmation = false;
    }

    /* public */

    hear(message) {
      let text = message.text.replace(/^<@\w*>:?\s*/,'').trim();

      console.log('Responding to: "' + text + '"');

      if (text.toLowerCase() === 'list') {
        this._listRestaurants();
        return;
      }

      if (this._findingRestaurant) {
        this._findRestaurant(text);
      } else if (this._confirmingRestaurant) {
        this._confirmRestaurant(text);
      } else if (this._extendedConfirmation) {
        this._extendedConfirmRestaurant(text);
      }
    }

    destroy() {
      if (exchanges[this._userID]) {
        console.log('Cleaning up exchange with ', this._username);
        delete exchanges[this._userID];
      }
    }

    /* private */

    _speak(message) {
      this._channel.send('@' + this._username + ': ' + message);
    }

    _findRestaurant(restaurantName) {
      console.log('Finding restaurant...');

      foursquare.searchVenues({
        near   : '440 Lafayette St. 10003',
        limit  : 5,
        query  : restaurantName
      }, (error, response) => {
        let venues;

        if (error || response.response.venues.length === 0) {
          this._speak('Sorry, I couldn\'t find a restaurant nearby that matches (check your spelling or tell Brendan if that seems wrong).');
          return console.error(error);
        }

        this._venues = response.response.venues;

        console.log('Restaurant found:', this._venues[0].name);
        console.log('Confirming restaurant with', this._username);

        this._speak('Is this it? ' + this._venues[0].name + ' (' + this._venues[0].location.address + ').' + ' Type "@lunchy: yes (or no)"!');

        this._findingRestaurant = false;
        this._confirmingRestaurant = true;
      });
    }

    _confirmRestaurant(confirmation) {
      if (confirmation.toLowerCase() === 'yes') {
        this._addRestaurant(this._venues[0].name);
      } else if (confirmation.toLowerCase() === 'no') {
        this._extendedConfirm();
      } else {
        return;
      }

      this._confirmingRestaurant = false;
    }

    _extendedConfirmRestaurant(number) {
      let index = Number(number) - 1;

      if (number.toLowerCase() === 'no') {
        this._speak('Well, you\'ve got me stumped. Try something else!');
        this.destroy();
        return;
      } else if (!this._venues[index]) {
        this._speak('First time using a keyboard? Try replying with one of the numbers.');
        return;
      }

      this._addRestaurant(this._venues[index].name);
    }

    _extendedConfirm() {
      let venueList = this._venues.map(venue => {
        return '' + (this._venues.indexOf(venue) + 1) + '. ' + venue.name + ' (' + venue.location.address + ')';
      });

      this._extendedConfirmation = true;

      venueList = venueList.join(' \n');

      this._speak('Dang! Is it one of these? \n' + venueList + '\n (Let me know the number, e.g. "@lunchy 3")');
    }

    _addRestaurant(restaurantName) {
      var _this = this;

      Restaurant.checkForExisting(restaurantName, function(error, exists) {
        if (error) {
          _this._speak('Err... looks like something went wrong. Try again?');
          _this.destroy();
          return console.error(error);
        }

        if (exists) {
          _this._speak('Looks like we\'ve already got that restaurant on the list! For a full list, type: "@lunchy list".');
          _this.destroy();
        } else {
          Restaurant.create(restaurantName, function(error, body) {
            if (error) {
              _this._speak('Err... looks like something went wrong. Try again?');
              _this.destroy();
              return console.error(error);
            }

            _this._speak('Great, ' + model.get('name') + ' has been added!');
            _this.destroy();
          });
        }
      });
    }

    _listRestaurants() {
      var _this = this;

      Restaurant.list(function(restaurants) {
        restaurants.sort();
        restaurants = restaurants.join(', ');
        _this._speak(restaurants);
      });
    }
  }

  slack.on('message', function(message) {
    let channel = slack.getChannelGroupOrDMByID(message.channel);

    if (channel.name === 'general' || message.type !== 'message' || typeof message.text === 'undefined') {
      return;
    }

    if (message.text.trim().indexOf('<@' + slack.self.id + '>') !== 0 && message.getChannelType() !== 'DM') {
      return;
    }

    if (!exchanges[message.user]) {
      exchanges[message.user] = new Exchange(message);
    }

    exchanges[message.user].hear(message);

    // No matter what, delete the exchange after five minutes. Nobody needs to take that long.
    _.delay(function() {
      if (exchanges[message.user]) {
        exchanges[message.user].destroy();
      }
    }, 300000);
  });

  slack.login();
})();