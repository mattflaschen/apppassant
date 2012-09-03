window.APPDOTNET = (function () {

    var default_options = {
        api_host: 'alpha-api.app.net',
        auth_host: 'alpha.app.net',
        url_base: '/stream/0/',
        authorize_endpoint: '/oauth/authenticate'
    };

    var API = {

        debug: false,

        /* Before init you need to get an access token */
        /* Think of this like a static function versus a class method */
        get_authorization_url: function (options) {
            var local_options = $.extend({}, default_options, options);
            var url = URI('https://' + local_options.auth_host + local_options.authorize_endpoint);

            url.addSearch('client_id', local_options.client_id);
            url.addSearch('redirect_uri', local_options.redirect_uri);
            url.addSearch('response_type', 'token');
            url.addSearch('scope', 'stream');

            return '' + url;

        },

        init: function (options) {
            this.options = $.extend({}, default_options, options);
            this.options.root_url = 'https://' + this.options.api_host + this.options.url_base;

            if (!this.options.access_token) {
                throw 'You must initialize the API with an access_token or it wont work';
            }

            if (this.options.no_globals) {
                delete window.APPDOTNET;
            }

            return this;
        },

        request: function (location, ajax_options) {
            ajax_options.data = ajax_options.data || {};

            ajax_options.url = this.options.root_url + location;
            ajax_options.data.access_token = this.options.access_token;
            ajax_options.dataType = 'json';
            if (this.debug) console.log("ADN Request: " + JSON.stringify(ajax_options));
            return $.ajax(ajax_options);
        },

        users: function (user_id) {
            user_id = user_id || 'me';
            var options = {
                type: 'GET'
            };

            var url = 'users/' + user_id;

            return this.request(url, options);
        },

        mentions: function (user_id) {
            user_id = user_id || 'me';
            var options = {
                type: 'GET'
            };

            var url = 'users/' + user_id + '/mentions';

            return this.request(url, options);
        },

        hashtags: function (tag) {
            var options = {
                type: 'GET'
            };

            var url = 'posts/tag/' + tag;

            return this.request(url, options);
        },

        posts: function (text, reply_to) {
            var options = {
                type: 'POST',
                data: {
                    text: text
                }
            };

            if (reply_to) {
                options.data.reply_to = reply_to;
            }

            return this.request('posts', options);
        },

        getposts: function (post_id, include_replies, before_id) {
            var options = {
                type: 'GET',
                data: {}
            };
            var url = 'posts/' + post_id;
            if (include_replies) {
                url = url + '/replies';
                options.data.count = 200;
                if (arguments.length >= 3 && !isNaN(before_id)) {
                    options.data.before_id = before_id;
                }
            }
            return this.request(url, options);
        },

        delete_post: function (post_id) {
            var options = {
                type: 'DELETE'
            };

            var url = 'posts/' + post_id;

            return this.request(url, options);
        },

        follows: function (user_id, new_state) {
            var options = {
                data: {
                    user_id: user_id
                }
            };
            if (new_state === 1) {
                // performing a follow
                options.type = 'POST';
            } else if (new_state === 0) {
                // performing an unfollow
                options.type = 'DELETE';
            } else {
                throw "Invalid follow state.";
            }
            return this.request('users/' + user_id + '/follow', options);
        }

    };

    return API;

} ());