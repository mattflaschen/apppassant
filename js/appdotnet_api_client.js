/*
 * App.net API wrapper
 *
 * JSON posts depend on json2.js or a recent browser, and URI.js (also MIT license)
 *
 * Copyright (c) 2012 Alex Kessinger, Joshua Blake
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

window.APPDOTNET = (function () {

    var default_options = {
        api_host: 'alpha-api.app.net',
        auth_host: 'alpha.app.net',
        url_base: '/stream/0/',
        authorize_endpoint: '/oauth/authenticate',
	debug: false
    };

    var API = {

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

        request: function (location, ajax_options, is_json) {
            ajax_options.data = ajax_options.data || {};

            ajax_options.url = this.options.root_url + location;
	    if(!is_json) { // Not JSON post
		ajax_options.data.access_token = this.options.access_token;
	    }
	    else { // JSON post
	        var url = URI(ajax_options.url);
		url.addSearch('access_token', this.options.access_token);
                ajax_options.url = '' + url;
                ajax_options.contentType = 'application/json';
                ajax_options.data = JSON.stringify(ajax_options.data);
	    }
            ajax_options.dataType = 'json';
            if (this.options.debug) console.log("ADN Request: " + JSON.stringify(ajax_options));
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

        mentions: function (user_id, params) {
            user_id = user_id || 'me';
            var options = {
                type: 'GET',
                data: params
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

        posts: function (text, reply_to, use_json, annotations) {
            var options = {
                type: 'POST',
                data: {
                    text: text
                }
            };

	    var url = 'posts';

            if (reply_to) {
                options.data.reply_to = reply_to;
            }

            if (annotations) {
                options.data.annotations = annotations;
                url += '?include_annotations=1';
            }

	    return this.request(url, options, use_json);
        },

        getposts: function (post_id, include_replies, before_id, include_annotations) {
            var parameters = {};
	    var url = 'posts/' + post_id;
	    parameters.include_annotations = include_annotations;
            if (include_replies) {
                url = url + '/replies';
                parameters.count = 200;
                if (arguments.length >= 3 && !isNaN(before_id)) {
                    parameters.before_id = before_id;
                }
            }
            return this.get(url, parameters);
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
        },

        stream: function (params)
	{
	    return this.request('posts/stream', {data: params});
	}
    };

    return API;

} ());