(function()
{
	if(typeof console == 'undefined')
	{
		console = { };
	}
	if(typeof console.log != 'function')
	{
		console.log = $.noop;
	}

	var api = APPDOTNET;

	var VENDOR_NAMESPACE = 'net.app.mattflaschen.chess';
	var STANDARD_NAMESPACE = 'games.chess';

	// Version when writing/posting annotations
	var WRITE_VERSION = "1.0";

	var FETCH_POSTS_MAX_COUNT = 2000;

	var authenticatedUsername, authenticatedName;

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

	function renderGamePost($boardControlHolder, posterUsername, html, pgn, color)
	{
		$boardControlHolder.addClass('game-post');
		var $boardHolder = $('<div />');
		$boardHolder.prop('id', 'board' + (boardCounter++));

		var beginning =
		{
			'class': 'icon-backward',
			title: 'Beginning',
			handler: function()
			{
				board.transitionTo(0);
				updateAnnotation();
			}
		};

		var previous =
		{
			'class': 'icon-step-backward',
			title: 'Previous',
			handler: function()
			{
				board.transitionBackward();
				updateAnnotation();
			}
		};

		var forward =
		{
			'class': 'icon-step-forward',
			title: 'Next',
			handler: function()
			{
				board.transitionForward();
				updateAnnotation();
			}
		};

		var $annotation = $('<p />', {'class': 'annotation'});
		function updateAnnotation()
		{
			$annotation.text(board.annotation());
		};

		function gotoEnd()
		{
			board.transitionTo(board.game.transitions.length);
			updateAnnotation();
		}

		var end =
		{
			'class': 'icon-forward',
			title: 'End',
			handler: gotoEnd
		};

		var flip =
		{
			'class': 'icon-resize-vertical',
			title: 'Flip',
			handler: function()
			{
				board.flipBoard();
			}
		};

		var controlSpecs = [beginning, previous, forward, end, flip];

		var controls = $.map(controlSpecs, function(spec)
		{
			var icon = $('<i />', {'class': spec['class']});
			var handler = spec.handler;
			return $('<a />', {href: '#', 'class': 'btn', title: spec.title}).append(icon).click(function(e)
			{
				handler();
				e.preventDefault();
			});
		});
		var $controlHolder = $('<div />', {'class': 'controls'}).append(controls);

		var $poster = $('<span />', {'class': 'poster'});
		var $posterLink = $('<a />', {href: 'http://appeio.com/' + posterUsername, text: '@' + posterUsername + ':'});
		$poster.append($posterLink);

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

		var $pgn = $('<p/>', {'class': 'pgn', text: pgn});

		$boardControlHolder.empty().append($boardHolder, $controlHolder, $annotation, $pgn, $poster, $msg, $('<hr />'));
		var board = $boardHolder.chess({pgn: pgn});
		if(color == 'black')
		{
			board.flipBoard();
		}
		gotoEnd();
	}

	// Preview when posting PGN
	function previewGame($errorDisplay, $board, username, $msg, pgn)
	{
		$errorDisplay.hide().text('');
		try
		{
			renderGamePost($board, username, $msg.val(), pgn);
		}
		catch(e)
		{
			console.log('Error rendering entered PGN: ');
			console.log(e);
			$errorDisplay.text('We were unable to display the game from your PGN.  Please try again.').show();
		}
	}

	// https://github.com/appdotnet/api-spec/issues/154, please
	/*
	 * Fetches up to FETCH_POSTS_MAX_COUNT posts using fetchFunction then calls foundCallback for each valid post (all if there is no filter)
	 *
	 * fetchFunction - AJAX function, taking the general post options, used to get a page of posts.
	 * postsFetched - the number of posts fetched already (internal)
	 * foundCallback - the function to call for matching posts.  Takes two arguments, the post and the first chess annotation
	 * isMore - boolean indicating if there are more posts (internal)
	 * filterCallback - function f, taking three arguments, the post, the annotation, and a single no-argument function g.  f should call g if and only if the post and annotation match the filter.  This allows filters that rely on AJAX.
	 * beforeId - previous minimum post ID, so only posts before this are fetched, or undefined, for most recent posts
	 */
	function fetchPosts(fetchFunction, postsFetched, foundCallback, isMore, filterCallback, beforeId)
	{
		if(isMore && postsFetched < FETCH_POSTS_MAX_COUNT)
		{
			fetchFunction({include_annotations: 1, include_directed_posts: 1, count: 200, before_id: beforeId}).done(function(env)
			{
				postsFetched += env.data.length;
				for(var i = 0; i < env.data.length; i++)
				{
					for(var j = 0; j < env.data[i].annotations.length; j++)
					{
						if(env.data[i].annotations[j].type == STANDARD_NAMESPACE || env.data[i].annotations[j].type == VENDOR_NAMESPACE)
						{
							(function(post, annotation)
							{
								 filterCallback(post, annotation, function()
								 {
									 foundCallback(post, annotation);
								 });
							})(env.data[i], env.data[i].annotations[j]);
							break; // Ignore double (or more) chess annotation on same post.
						}
					}
				}
				fetchPosts(fetchFunction, postsFetched, foundCallback, env.meta.more, filterCallback, env.meta.min_id);
			});
		}
	}

	/*
	 * $holder - jQuery node for a list that posts will be appended to
	 * fetchFunction - see fetchPosts
	 * filterCallback - seee fetchPosts
	 */
	function fetchPostsToDisplay($holder, fetchFunction, filterCallback)
	{
		if(filterCallback === undefined)
		{
			filterCallback = function(post, annotation, valid)
			{
				valid();
			};
		}

		fetchPosts(fetchFunction, 0, function(post, annotation)
		{
			// Default to white for e.g. historical games
			var color = 'white';
			var $post = $('<div/>');
			$holder.append($post);
			try
			{
				if(annotation.value.correspondence && annotation.value.correspondence.black == authenticatedUsername)
				{
					color = 'black';
				}
				renderGamePost($post, post.user.username, post.html, annotation.value.pgn, color);
			}
			catch(e)
			{
				console.log('Error rendering game from stream: ');
				console.log(e);
				// We add then remove on error because board must be in the DOM when board is rendered due to internal jchess quirk.
				$post.remove();
			}
		}, true, filterCallback);
	}

	// Searches all posts available through fetchFunction for a chess post and annotation matching predicateFunction.  Calls resultCallback as soon as a matching post is found, or all posts are checked.
	function isMatchingPost(fetchFunction, predicateFunction, resultCallback, isMore, beforeId)
	{
		if(isMore)
		{
			fetchFunction({include_annotations: 1, include_directed_posts: 1, count: 200, before_id: beforeId}).done(function(env)
			{
				for(var i = 0; i < env.data.length; i++)
				{
					for(var j = 0; j < env.data[i].annotations.length; j++)
					{
						if(env.data[i].annotations[j].type == STANDARD_NAMESPACE || env.data[i].annotations[j].type == VENDOR_NAMESPACE)
						{
							var post = env.data[i];
							var annotation = env.data[i].annotations[j];
							if(predicateFunction(post, annotation))
							{
								resultCallback(true);
								return;
							}
							break; // Ignore double (or more) chess annotation on same post.
						}
					}
				}
				isMatchingPost(fetchFunction, predicateFunction, resultCallback, env.meta.more, env.meta.min_id);
			});
		}
		else
		{
			resultCallback(false);
		}
	}

	$(function()
	{
		$('#throbber').ajaxStart(function()
		{
			$(this).show();
		}).ajaxStop(function()
		{
			$(this).hide();
		});

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

		$('body').removeClass('unauthorized').addClass('authorized');
		$.cookie('token', token);

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
		});

		$('.adn-message').attr('maxlength', 256);

		fetchPostsToDisplay($('#streamList'), function(o)
		{
			return api.stream(o);
		});

		$('.modal').on('show', function()
		{
			$('form', this)[0].reset();
			$('.game-post', this).empty();
		});

		$('#previewGameBtn').click(function()
		{
			previewGame($('#postModalError'), $('#postModalBoard'), authenticatedUsername, $('#postModalMsg'), $('#postModalPgn').val());
		});

		$('#postGameBtn').click(function()
		{
			var $btn = $(this);
			$btn.button('loading');
			api.posts($('#postModalMsg').val(), null, true,
			[
				{
					type: STANDARD_NAMESPACE,
					value:
					{
						version: WRITE_VERSION,
						is_active: $('#postModalBeingPlayed').is(':checked'),
						pgn: $('#postModalPgn').val()
					}
				}
			]).always(function()
			{
				$btn.button('reset');
			});
		});

		// Is post a valid, open challenge of the authenticated user?  If so, call validCallback.
		function isValidOpenChallenge(post, annotation, validCallback)
		{
			annotation = annotation.value;
			if(!annotation.version || annotation.result || !annotation.correspondence)
			{
				// If it's the old schema, or already has a result, even *, or no correspondence, short-circuit.
				return;
			}
			var poster = post.user.username;
			var userInChallenge = (annotation.correspondence.white == authenticatedUsername || annotation.correspondence.black == authenticatedUsername);
			var posterPlaysAsBlack = annotation.correspondence.black == poster;
			var isPgn = (typeof annotation.pgn == 'string');
			var posterInChallenge = (annotation.correspondence.white == poster || posterPlaysAsBlack);
			var notEqual = (annotation.correspondence.white != annotation.correspondence.black);

			if(userInChallenge && posterInChallenge && notEqual && (posterPlaysAsBlack || isPgn))
			{
				// Check if current user has already accepted/rejected

				// If there are no direct replies we don't have to check further.
				if(post.num_replies == 0)
				{
					validCallback();
				}
				else
				{
					// See if any of the posts in the thread are direct replies by the poster.  Issue 171 would make this faster and easier.
					isMatchingPost(function(o)
					{
						return api.getposts(post.id, true, o);
					}, function(thread_post, thread_annotation)
					{
						var result = thread_annotation.value.result;
						return (thread_post.reply_to == post.id && post.user.username == authenticatedUsername && thread_annotation.value.correspondence.challenge_post_id == post.id && (result == '*' || result == 'rejected'));
					}, function(isMatch)
					{
						// isMatch true means the user already replied, so challenge is no longer open.  Otherwise, it's valid.
						if(!isMatch)
						{
							validCallback();
						}
					}, true);
				}
			}
		}

		fetchPostsToDisplay($('#challengesList'), function(o)
		{
			return api.mentions('me', o);
		}, isValidOpenChallenge);


		var $createChallengeModal = $('#createChallengeModal');
		var $createChallengeWhiteFirstPly = $('#createChallengeWhiteFirstPly');

		function getWhiteChallengePgn()
		{
			var pgn = $createChallengeWhiteFirstPly.val();
			if(!/^1\./.test(pgn))
			{
				pgn = '1. ' + pgn;
			}
			return pgn;
		}

		var $createChallengeMessage = $('#createChallengeMessage');

		$('#previewChallengeBtn').click(function()
		{
			previewGame($('#createChallengeModalError'), $('#createChallengeBoard'), authenticatedUsername, $createChallengeMessage, getWhiteChallengePgn());
		});

		var $createChallengePieces = $('#createChallengePieces');
		$createChallengePieces.on('click', 'a', function()
		{
			$('.as-white', $createChallengeModal).toggle($(this).data('color') == 'white');
		});

		$('#createChallengeBtn').click(function()
		{
			var $btn = $(this);
			$btn.button('loading');
			var myColor = $('a.active', $createChallengePieces).data('color');
			var otherColor = $('a:not(.active)', $createChallengePieces).data('color');
			var pgn;

			if(myColor == 'white')
			{
				pgn = getWhiteChallengePgn();
			}
			var annotation =
			{
				version: WRITE_VERSION,
				correspondence: { },
				pgn: pgn
			};
			annotation.correspondence[myColor] = authenticatedUsername;
			var opponent = $('#createChallengeOpponent').val();
			if(opponent.charAt(0) == '@')
			{
				opponent = opponent.substr(1);
			}
			annotation.correspondence[otherColor] = opponent;
			var msg = $createChallengeMessage.val();
			var opponentMention = '@' + opponent;
			var opponentMentionRegex = new RegExp(opponentMention + '(?:[^0-9a-z_]|$)');
			if(!opponentMentionRegex.test(msg))
			{
				msg = opponentMention + ' ' + msg;
			}
			api.posts(msg, null, true,
			[
				{
					type: STANDARD_NAMESPACE,
					value: annotation
				}
			]).always(function()
			{
				$btn.button('reset');
			});
		});

		fetchPostsToDisplay($('#postsList'), function(o)
		{
			return api.get_user_posts('me', o);
		});

	});
})();