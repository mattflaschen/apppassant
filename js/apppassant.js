(function()
{
	var state = { }, api = APPDOTNET;

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

	function renderLastMove($boardHolder, pgn)
	{
		// Could maybe use post ID, but this is more futureproof
		if($boardHolder.prop('id') == '')
		{
			$boardHolder.prop('id', 'board' + (boardCounter++));
		}
		var board = $boardHolder.html('').chess({pgn: pgn});
		board.transitionTo(board.game.transitions.length);
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

		state.token = token;
		$.cookie('token', token);
		api.init(
		{
			access_token: token,
			debug: true,
			no_globals: true
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
			var $board = $('<div/>');
			var $msg = $('<p/>', { html: post.html });
			var $border = $('<hr/>');
			$post.append($board, $msg, $border);
			$holder.append($post);
			renderLastMove($board, annotation.value.pgn);
		}, true);

		$('body').removeClass('unauthorized').addClass('authorized');

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
			renderLastMove($('#postModalBoard'), $('#postModalPgn').val());
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