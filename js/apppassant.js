(function()
{
	var api = APPDOTNET;

	// Standard one coming
	var vendorNamespace = 'net.app.mattflaschen.chess';

	jQuery.support.cors = true;

	function getToken()
	{
		var token, match = window.location.hash.match(/access_token=([^&]*)/);
		if(match)
		{
			token = match[1];
 			if(token)
			{
				return token;
			}
		}

		token = $.cookie('token');
		return token;
	}

	var boardCounter = 0;

	function renderGamePost($boardControlHolder, html, pgn)
	{
		$boardControlHolder.addClass('gamePost');
		var $boardHolder = $('<div />');
		$boardHolder.prop('id', 'board' + (boardCounter++));

		var beginning = $('<i />', {'class': 'icon-backward', title: 'Beginning'});

		var previous =  $('<i />', {'class': 'icon-step-backward', title: 'Previous'});

		var forward =  $('<i />', {'class': 'icon-step-forward', title: 'Next'});

		function gotoEnd()
		{
			board.transitionTo(board.game.transitions.length);
		}

		var end = $('<i />', {'class': 'icon-forward', title: 'End'});

		var controls = [beginning, previous, forward, end];
		var handlers =
		[
			function()
			{
				board.transitionTo(0);
			},
			function()
			{
				board.transitionBackward();
			},
			function()
			{
				board.transitionForward();
			},
			gotoEnd
		];

		for(var i = 0; i < controls.length; i++)
		{
			controls[i] = $('<a />', {href: '#', 'class': 'btn'}).append(controls[i]).click(handlers[i]);
		}
		var $controlHolder = $('<div />', {'class': 'controls'}).append(controls);

		var $msg = $('<p/>', {html: html});
		$('span[itemprop=hashtag]', $msg).each(function()
		{
			var $this = $(this);
			var hashtag = $this.data('hashtag-name');
			$this.html($('<a />', {href: 'http://appeio.com/?tag=' + hashtag, text: $this.text()}));
		});

		$('span[itemprop=mention]', $msg).each(function()
		{
			var $this = $(this);
			var mention = $this.data('mention-name');
			$this.html($('<a />', {href: 'http://appeio.com/' + mention, text: $this.text()}));
		});

		$boardControlHolder.html('').append($boardHolder, $controlHolder, $msg, $('<hr />'));
		var board = $boardHolder.chess({pgn: pgn});
		gotoEnd();
	}

	$(function()
	{
		var token = getToken();
		if(!token)
		{
			var $connectLink = $('#connectContainer a');
			var connectUrl = 'https://alpha.app.net/oauth/authenticate?client_id=gpLxdRy8kwJEmdhHmfD3nfr6CJzXZWe6&response_type=token&redirect_uri=' +
				window.location.protocol + '//' + window.location.host + '&scope=stream%20write_post%20follow%20messages';
			$connectLink.attr('href', connectUrl);
			$('#connectContainer').removeClass('hide');

			return;
		}

		$.cookie('token', token);

		var authenticatedUsername, authenticatedName;

		api.init(
		{
			access_token: token,
			debug: true,
			no_globals: true
		});

		api.users().done(function(env)
		{
			authenticatedUsername = env.data.username;
			authenticatedName = env.data.name;

			$('body').removeClass('unauthorized').addClass('authorized');
		});

		$('#throbber').ajaxStart(function()
		{
			$(this).show();
		}).ajaxStop(function()
		{
			$(this).hide();
		});

		// https://github.com/appdotnet/api-spec/issues/154, please
		function fetchPosts(postsFetched, callback, isMore, minId)
		{
			if(postsFetched < 2000 && isMore)
			{
				api.stream({include_annotations: 1, count: 200, before_id: minId}).done(function(env)
				{
					console.log(env);
					postsFetched += env.data.length;
					for(var i = 0; i < env.data.length; i++)
					{
						for(var j = 0; j < env.data[i].annotations.length; j++)
						{
							if(env.data[i].annotations[j].type == vendorNamespace)
							{
								callback(env.data[i], env.data[i].annotations[j]);
							}
						}
					}
					fetchPosts(postsFetched, callback, env.meta.more, env.meta.min_id);
				});
			}
		}

		var $holder = $('#gamesFromStream');

		fetchPosts(0, function(post, annotation)
		{
			var $post = $('<div/>');
			$holder.append($post);
			renderGamePost($post, post.html, annotation.value.pgn);
		}, true);

		$('.modal').on('show', function()
		{
			$(':input', this).val('');
		});

		$('#postGameModal').on('show', function()
		{
			$('#postModalBoard').html('');
		});


		$('#previewGameBtn').click(function()
		{
			renderGamePost($('#postModalBoard'), $('#postModalMsg').val(), $('#postModalPgn').val());
		});

		$('#postGameBtn').click(function()
		{
			var btn = this;
			$(btn).button('loading');
			api.posts($('#postModalMsg').val(), null, true, [
			    {
				    type: vendorNamespace,
				    value:
				    {
				        is_active: $('#postModalBeingPlayed').is(':checked'),
					pgn: $('#postModalPgn').val()
				    }
			    }
			]).always(function()
			{
				$(btn).button('reset');

			});
		});
	});
})();