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

	var authenticatedUsername, authenticatedName, authenticatedUserType;

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

	function renderGamePost($boardControlHolder, posterUsername, html, showPgn, pgn, viewAsBlack, post, annotation, buttons)
	{
		pgn = pgn || '';
		$boardControlHolder.addClass('game-post');
		if(post !== undefined)
		{
			$boardControlHolder.data('post', post);
		}
		if(annotation !== undefined)
		{
			$boardControlHolder.data('annotation', annotation);
		}

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


		$boardControlHolder.empty().append($boardHolder, $controlHolder, $annotation);
		if(showPgn)
		{
			var $pgn = $('<p/>', {'class': 'pgn', html: pgn.replace(/\n/g, '<br>')});
			$boardControlHolder.append($pgn);
		}
		$boardControlHolder.append($poster, $msg);
		if(buttons)
		{
			var $buttons = $('<div />');
			$.each(buttons, function()
			{
				var options = $.extend({'class': 'btn btn-primary', role: 'button'}, this);
				var $button = $('<a />', options);
				$buttons.append($button, '\n');
			});
			$boardControlHolder.append($buttons);
		}
		$boardControlHolder.append($('<hr />'));
		var board = $boardHolder.chess({pgn: pgn});
		if(viewAsBlack)
		{
			board.flipBoard();
		}
		gotoEnd();
	}

	// Preview when posting PGN
	function previewGame($errorDisplay, $board, $msg, game, pgn, viewAsBlack)
	{
		if(game.move_number() == 1 && game.turn() == 'w')
		{
			// jchess does not handle non-empty PGN without moves (e.g. only headers and termination) correctly.
			pgn = '';
		}

		// It's better to pass it in when possible, so we don't have to re-serialize something we already have.
		if(typeof pgn == 'undefined')
		{
			pgn = game.pgn();
		}

		try
		{
			renderGamePost($board, authenticatedUsername, $msg.val(), false, pgn, viewAsBlack);
		}
		catch(e)
		{
			// This should be unreachable if earlier validation is done properly.
			console.log('Error previewing entered PGN: ');
			console.log(e);
			$errorDisplay.text('We were unable to display the game from your PGN.  Please try again.').show();
		}
	}

	function getChessAnnotation(post)
	{
		for(var i = 0; i < post.annotations.length; i++)
		{
			if(post.annotations[i].type == STANDARD_NAMESPACE || post.annotations[i].type == VENDOR_NAMESPACE)
			{
				// Ignore double (or more) chess annotation on same post.
				return post.annotations[i];
			}
		}
		return null;
	}

	// https://github.com/appdotnet/api-spec/issues/154, please
	/*
	 * Fetches up to FETCH_POSTS_MAX_COUNT posts using fetchFunction then calls foundCallback for each valid post (all if there is no filter)
	 *
	 * fetchFunction - AJAX function, taking the general post options, used to get a page of posts.
	 * postsFetched - the number of posts fetched already (internal)
	 * actions - array of objects with two fields, filter and found:
	 ** filter - function f, taking three arguments, the post, the annotation, and a single no-argument function g.  f should call g if and only if the post and annotation match the filter.  This allows filters that rely on AJAX.
	 ** found - the function to call for matching posts.  Takes two arguments, the post and the first chess annotation
	 * isMore - boolean indicating if there are more posts (internal)
	 * beforeId - previous minimum post ID, so only posts before this are fetched, or undefined, for most recent posts
	 */
	function fetchPosts(fetchFunction, postsFetched, actions, isMore, beforeId)
	{
		if(isMore && postsFetched < FETCH_POSTS_MAX_COUNT)
		{
			fetchFunction({include_annotations: 1, include_directed_posts: 1, count: 200, before_id: beforeId}).done(function(env)
			{
				postsFetched += env.data.length;
				for(var i = 0; i < env.data.length; i++)
				{
					var possibleAnnotation = getChessAnnotation(env.data[i]);
					if(possibleAnnotation)
					{
						(function(post, annotation)
						{
							$.each(actions, function(i, action)
							{
								action.filter(post, annotation, function()
								{
									action.found(post, annotation);
								});
							});
						})(env.data[i], possibleAnnotation);
					}
				}
				fetchPosts(fetchFunction, postsFetched, actions, env.meta.more, env.meta.min_id);
			});
		}
	}

	/*
	 * fetchFunction - see fetchPosts
	 * mappings - array of objects with up to three fields, holder, filter, buttons.
	 ** holder - jQuery element to hold fetched posts.
	 ** filter - see fetchPosts
	 ** buttons - buttons to show below game.  See renderGamePost.
	 */
	function fetchPostsToDisplay(fetchFunction, mappings)
	{
		function nopFilter(post, annotation, valid)
		{
			valid();
		};

		var actions = $.map(mappings, function(mapping)
		{
			return {
				filter: mapping.filter || nopFilter,
				found: function(post, annotation)
				{
					// Default to white for e.g. historical games
					var viewAsBlack = false;
					var $post = $('<div/>');
					mapping.holder.append($post);
					try
					{
						if(annotation.value.correspondence && annotation.value.correspondence.black == authenticatedUsername)
						{
							viewAsBlack = true;
						}
						renderGamePost($post, post.user.username, post.html, true, annotation.value.pgn, viewAsBlack, post, annotation, mapping.buttons);
					}
					catch(e)
					{
						console.log('Error rendering game from stream: ');
						console.log(e);
						// We add then remove on error because board must be in the DOM when board is rendered due to internal jchess quirk.
						$post.remove();
					}
				}
			};
		});

		fetchPosts(fetchFunction, 0, actions, true);
	}

	// Searches all posts available through fetchFunction for a chess post and annotation matching predicateFunction.  Calls resultCallback as soon as a matching post is found, or all posts are checked.
	function isMatchingPost(fetchFunction, predicateFunction, resultCallback, isMore, beforeId, sinceId)
	{
		if(isMore)
		{
			fetchFunction({include_annotations: 1, include_directed_posts: 1, count: 200, before_id: beforeId, since_id: sinceId}).done(function(env)
			{
				for(var i = 0; i < env.data.length; i++)
				{
					var annotation = getChessAnnotation(env.data[i]);
					if(annotation)
					{
						if(predicateFunction(env.data[i], annotation))
						{
							resultCallback(true);
							return;
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

	function addMention(msg, username)
	{
		var userMention = '@' + username;
		var userMentionRegex = new RegExp(userMention + '(?:[^0-9a-z_]|$)');
		if(!userMentionRegex.test(msg))
		{
			msg = userMention + ' ' + msg;
		}
		return msg;
	}

	function getPGNName(username, name)
	{
		var nameRegex = /^(.+)\s(\S+)$/;
		var userMatch = name.match(nameRegex);
		var pgnName;
		if(userMatch)
		{
			pgnName = userMatch[2] + ', ' + userMatch[1];
		}
		else
		{
			pgnName = name;
		}
		pgnName += ' (' + username + ')';
		return pgnName;
	}

	function getPGNType(type)
	{
		if(type == 'bot')
		{
			return 'program';
		}
		else
		{
			return type;
		}
	}

	function getPaddedToTwo(number)
	{
		if(number < 10)
		{
			number = '0' + number;
		}
		return number;
	}

	function addPGNHeaders(game, opponent, annotationValue)
	{
		var playerInfo =
		{
			white:
			{
				username: annotationValue.correspondence.white
			},
			black:
			{
				username: annotationValue.correspondence.black
			}
		};
		if(playerInfo.white.username == authenticatedUsername)
		{
			playerInfo.white.name = authenticatedName;
			playerInfo.white.type = getPGNType(authenticatedUserType);
			playerInfo.black.name = opponent.name;
			playerInfo.black.type = getPGNType(opponent.type);
		}
		else
		{
			playerInfo.black.name = authenticatedName;
			playerInfo.black.type = getPGNType(authenticatedUserType);
			playerInfo.white.name = opponent.name;
			playerInfo.white.type = getPGNType(opponent.type);
		}
		playerInfo.white.pgnName = getPGNName(playerInfo.white.username, playerInfo.white.name);
		playerInfo.black.pgnName = getPGNName(playerInfo.black.username, playerInfo.black.name);
		var date = new Date();
		var year = date.getUTCFullYear();
		var month = getPaddedToTwo(date.getUTCMonth() + 1);
		var dateOfMonth = getPaddedToTwo(date.getUTCDate());
		var dateString = year + '.' + month + '.' + dateOfMonth;
		var hours = getPaddedToTwo(date.getUTCHours());
		var minutes = getPaddedToTwo(date.getUTCMinutes());
		var seconds = getPaddedToTwo(date.getUTCSeconds());
		var time = hours + ':' + minutes + ':' + seconds;
		game.header('Event', 'App Passant Correspondence Game',
			    'Site', 'App Passant (http://apppassant.com/) / app.net',
			    'Date', dateString,
			    'Round', '-',
			    'White', playerInfo.white.pgnName,
			    'Black', playerInfo.black.pgnName,
			    'Result', '*',
			    'UTCDate', date,
			    'UTCTime', time,
			    'WhiteType', playerInfo.white.type,
			    'BlackType', playerInfo.black.type,
			    'TimeControl', '-'
		);
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
			var url = window.location.href;
			url = url.replace(/#[^#]*$/, '');
			var connectUrl = 'https://alpha.app.net/oauth/authenticate?client_id=gpLxdRy8kwJEmdhHmfD3nfr6CJzXZWe6&response_type=token&redirect_uri=' +
				url + '&scope=stream%20write_post%20follow%20messages';
			$connectLink.attr('href', connectUrl);
			$('#connectContainer').removeClass('hide');

			return;
		}

		$('body').removeClass('unauthorized').addClass('authorized');
		$.cookie('token', token);

		api.init(
		{
			access_token: token,
			debug: false,
			no_globals: true
		});

		api.users().done(function(env)
		{
			authenticatedUsername = env.data.username;
			authenticatedName = env.data.name;
			authenticatedUserType = env.data.type;
			loadTabs();
		});
	});

	function loadTabs()
	{
		$('.adn-message').attr('maxlength', 256);

		function isGame(post, annotation, validCallback)
		{
			if(annotation.value.pgn)
			{
				var game = new Chess();
				var isValid = game.load_pgn(annotation.value.pgn);
				if(isValid)
				{
					validCallback();
				}
			}
		}

		fetchPostsToDisplay(function(o)
		{
			return api.stream(o);
		}, [{holder: $('#streamList'), filter: isGame}]);

		$('.modal').on('show', function()
		{
			$('form', this).each(function()
			{
				this.reset();
			});
			$('.text-error', this).hide().text('');
			$('.game-post', this).empty();
		});

		var $postModalError = $('#postModalError');

		$('#previewGameBtn').click(function()
		{
			var pgn = $('#postModalPgn').val();
			var game = new Chess();
			var isValid = game.load_pgn(pgn);
			displayIfIllegalGame($postModalError, isValid);
			if(isValid)
			{
				setResult(game);
				previewGame($postModalError, $('#postModalBoard'), $('#postModalMsg'), game, pgn);
			}
		});

		$('#postGameBtn').click(function()
		{
			var $btn = $(this);
			$btn.button('loading');
			var $modal = $btn.parents('.modal');
			var game = new Chess();
			var pgn = $('#postModalPgn').val();
			var isValid = game.load_pgn(pgn);
			displayIfIllegalGame($postModalError, isValid);
			if(!isValid)
			{
				$btn.button('reset');
				return;
			}
			var annotation =
			{
				type: STANDARD_NAMESPACE,
				value:
				{
					version: WRITE_VERSION,
					result: '*',
					pgn: pgn
				}
			};
			setResult(game);
			var result = game.header().Result;
			if(result)
			{
				annotation.value.result = result;
			}

			api.posts($('#postModalMsg').val(), null, true,
			[
				annotation
			]).done(function()
			{
				$modal.modal('hide');
			}).always(function()
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
				if(!posterPlaysAsBlack)
				{
					var game = new Chess();
					var isValid = game.load_pgn(annotation.pgn);
					if(!isValid)
					{
						return;
					}
				}

				// Check if current user has already accepted/rejected

				// If there are no direct replies we don't have to check further.
				if(post.num_replies == 0)
				{
					validCallback();
				}
				else
				{
					// See if any of the posts in the thread are direct replies with acceptance (*) or rejection (rejected) by the current user.  Issue 171 would make this faster and easier.
					isMatchingPost(function(o)
					{
						return api.getposts(post.id, true, o);
					}, function(threadPost, threadAnnotation)
					{
						var result = threadAnnotation.value.result;
						return (threadPost.reply_to == post.id && threadPost.user.username == authenticatedUsername && threadAnnotation.value.correspondence.challenge_post_id == post.id && (result == '*' || result == 'rejected'));
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

		function getGameData(btn)
		{
			var $gamePost = $(btn).parents('.game-post');
			var data = $.extend(true, {}, $gamePost.data());
			return data;
		}

		// Open move modal
		function openMove(post, annotation)
		{
			annotation.type = STANDARD_NAMESPACE;
			$moveModal.data('previousPost', post);
			$moveModal.data('annotation', annotation);
			$moveModal.modal();
			previewMove();
		}

		// Accept challenge and open move modal
		function openMoveFromChallenge()
		{
			var data = getGameData(this);
			var moveAnnotation = data.annotation;
			moveAnnotation.value.correspondence.challenge_post_id = data.post.id;
			var game = new Chess();
			game.load_pgn(moveAnnotation.value.pgn || '');
			addPGNHeaders(game, data.post.user, moveAnnotation.value);
			moveAnnotation.value.pgn = game.pgn();
			openMove(data.post, moveAnnotation);
		}

		function openMoveFromReadyGame()
		{
			var data = getGameData(this);
			openMove(data.post, data.annotation);
		}

		function openRejectChallenge()
		{
			var data = getGameData(this);
			var rejectAnnotation = data.annotation;
			rejectAnnotation.type = STANDARD_NAMESPACE;
			rejectAnnotation.value.result = 'rejected';
			rejectAnnotation.value.correspondence.challenge_post_id = data.post.id;
			var $rejectModal = $('#rejectChallengeModal');
			$rejectModal.data('previousPost', data.post);
			$rejectModal.data('annotation', rejectAnnotation);
			$rejectModal.modal();
		}

		fetchPostsToDisplay(function(o)
		{
			return api.mentions('me', o);
		},
		[
			{
				holder: $('#challengesList'),
				filter: isValidOpenChallenge,
				buttons:
				[
					{
						text: 'Accept',
						click: openMoveFromChallenge
					},
					{
						text: 'Reject',
						'class': 'btn',
						click: openRejectChallenge
					}
				]
			},
			{
				holder:	$('#readyGamesList'),
				filter:	isValidReadyGame,
				buttons:
				[
					{
						text: 'Move',
						click: openMoveFromReadyGame
					}
				]
			}
		]);


		var $createChallengeModal = $('#createChallengeModal');
		var $createChallengeWhiteFirstPly = $('#createChallengeWhiteFirstPly');

		function getWhiteChallengePly()
		{
			var ply = $createChallengeWhiteFirstPly.val();
			return ply;
		}

		var $createChallengeMessage = $('#createChallengeMessage'), $createChallengeModalError = $('#createChallengeModalError');

		$('#previewChallengeBtn').click(function()
		{
			var ply = getWhiteChallengePly();
			if(ply)
			{
				var moveInfo = getGameAndMove('', ply);
				displayIfIllegalPly($createChallengeModalError, moveInfo, ply);
				if(moveInfo.move)
				{
					previewGame($('#createChallengeModalError'), $('#createChallengeBoard'), $createChallengeMessage, moveInfo.game);
				}
			}
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
				var ply = getWhiteChallengePly();
				var moveInfo = getGameAndMove('', ply);
				displayIfIllegalPly($createChallengeModalError, moveInfo, ply);
				if(!moveInfo.move)
				{
					$btn.button('reset');
					return;
				}
				pgn = moveInfo.game.pgn();
			}
			var annotationValue =
			{
				version: WRITE_VERSION,
				correspondence: { },
				pgn: pgn
			};
			annotationValue.correspondence[myColor] = authenticatedUsername;
			var opponent = $('#createChallengeOpponent').val();
			if(opponent.charAt(0) == '@')
			{
				opponent = opponent.substr(1);
			}
			opponent = $.trim(opponent);
			annotationValue.correspondence[otherColor] = opponent;
			var msg = $createChallengeMessage.val();
			msg = addMention(msg, opponent);
			api.posts(msg, null, true,
			[
				{
					type: STANDARD_NAMESPACE,
					value: annotationValue
				}
			]).done(function()
			{
				$createChallengeModal.modal('hide');
			}).always(function()
			{
				$btn.button('reset');
			});
		});

		fetchPostsToDisplay(function(o)
		{
			return api.get_user_posts('me', o);
		},
		[
			{
				holder: $('#postsList'),
				filter: isGame
			}
		]);


		$('#rejectChallengeBtn').click(function()
		{
			var $modal = $(this).parents('.modal');
			var previousPost = $modal.data('previousPost');
			var rejectAnnotation = $modal.data('annotation');
			var msg = $('#rejectChallengeMessage').val();
			msg = addMention(msg, previousPost.user.username);
			api.posts(msg, previousPost.id, true,
			[
				rejectAnnotation
			]).always(function()
			{
				$btn.button('reset');
			});
		});

		function isValidReadyGame(post, annotation, validCallback)
		{
			annotation = annotation.value;
			if(!(annotation.version && annotation.result == '*' && post.reply_to && annotation.correspondence))
			{
				return;
			}

			// Get post they're replying to (previous post).
			api.getposts(post.reply_to, false, {include_annotations: 1}).done(function(env)
			{
				var previousPost = env.data;
				var previousAnnotation = getChessAnnotation(previousPost);

				if(!previousAnnotation)
				{
					return;
				}

				previousAnnotation = previousAnnotation.value;

				// These checks consider the previous post in isolation.

				// There should only be a missing challenge_post_id on previous if it was a challenge, which is reflected in the second line; challenges don't have results either.
				if(!(previousPost.user.username == authenticatedUsername && previousAnnotation.correspondence &&
				     (previousAnnotation.correspondence.challenge_post_id || !previousAnnotation.result)))
				{
					return;
				}

				function getPostMoveInformation(post, annotationValue)
				{
					// This does useful normalization (e.g. removes numbers and spacing, add + for check).
					var pgn = annotationValue.pgn || '';
					var halfMoveCount, gameBody;
					if(pgn != '')
					{
						var chess = new Chess();
						var isValidPgn = chess.load_pgn(pgn);
						var history = chess.history();
						gameBody = history.toString();
						halfMoveCount = history.length;
					}
					else
					{
						// PGN expected to be empty for challenges as black.
						gameBody = '';
						halfMoveCount = 0;
					}

					return {
						annotationValue: annotationValue,
						post: post,
						challengePostId: annotationValue.correspondence.challenge_post_id || post.id,
						gameBody: gameBody,
						halfMoveCount: halfMoveCount,
						isValidPgn: isValidPgn
					};
				}

				/*
				   This only considers previous and reply, not other potential replies to previous.
				   We're checking that the reply is an appropriate response to the challenge or move in previous, in the same game.

				   This is a regular predicate, since it does not require AJAX.  Parameters should be as returned from getPostMoveInformation
				 */
				function isValidMoveReply(previous, reply)
				{
					if(!reply.isValidPgn)
					{
						return false;
					}

					var expectedPosterColor;
					if(previous.annotationValue.correspondence.white == previous.post.user.username)
					{
						expectedPosterColor = 'black';
					}
					else
					{
						expectedPosterColor = 'white';
					}

					if(!(reply.annotationValue.correspondence && reply.annotationValue.correspondence.white == previous.annotationValue.correspondence.white &&
					     reply.annotationValue.correspondence.black == previous.annotationValue.correspondence.black &&
					     reply.annotationValue.correspondence.challenge_post_id == previous.challengePostId && reply.annotationValue.correspondence[expectedPosterColor] == reply.post.user.username &&
					     (reply.annotationValue.correspondence.is_final === undefined || reply.annotationValue.correspondence.is_final === true)))
					{
						return false;
					}

					var replyExtendsPrevious = reply.gameBody.indexOf(previous.gameBody) == 0;
					if(!(replyExtendsPrevious && (reply.halfMoveCount - previous.halfMoveCount) == 1))
					{
						return false;
					}

					return true;
				}

				var previousPostInfo = getPostMoveInformation(previousPost, previousAnnotation);
				var postInfo = getPostMoveInformation(post, annotation);

				// Is the main post a valid reply?
				if(!isValidMoveReply(previousPostInfo, postInfo))
				{
					return;
				}

				var possiblyDouble = previousPost.num_replies > 1;
				var possiblyResolved = post.num_replies > 0;
				if(!possiblyDouble && !possiblyResolved)
				{
					validCallback();
					return;
				}

				/*
				   Otherwise, check the whole thread to see if either a. There is a previous valid move (i.e. this is a double move) or b. The authenticated user already responded to this move.

				   If both, after previous.
				   If only possiblyDouble, after previous, before post.
				   If only possiblyResolved, after post.
				 */
				var sinceId = post.id, beforeId = post.id;
				if(possiblyDouble)
				{
					sinceId = previousPost.id;
				}
				if(possiblyResolved)
				{
					beforeId = undefined;
				}

				isMatchingPost(function(o)
				{
					return api.getposts(post.id, true, o);
				}, function(threadPost, threadAnnotation)
				{
					if(threadPost.reply_to == previousPost.id && threadPost.id < post.id)
					{
						var threadPostInfo = getPostMoveInformation(threadPost, threadAnnotation.value);
						if(isValidMoveReply(previousPostInfo, threadPostInfo))
						{
							// Earlier valid move reply to previousPost (post is double move)
							return true;
						}
					}
					else if(threadPost.user.username == authenticatedUsername && threadPost.reply_to == post.id)
					{
						var threadPostInfo = getPostMoveInformation(threadPost, threadAnnotation.value);
						if(isValidMoveReply(postInfo, threadPostInfo))
						{
							// Valid move reply by current user in response to post already
							return true;
						}
					}

					return false;
				}, function(isMatch)
				{
					// isMatch true means either the opponent made an earlier valid move reply to previousPost (so this is a double move), or the current user already made the move after this.  Otherwise, it's valid.
					// Both of these would be much faster with an endpoint to get direct replies (issue 171).
					if(!isMatch)
					{
						validCallback();
					}
				}, true, beforeId, sinceId);
			});
		}

		var $moveModal = $('#moveModal'), $movePly = $('#movePly'), $moveModalError = $('#moveModalError'), $moveBoard = $('#moveBoard'), $moveMessage = $('#moveMessage');

		function stripMoveNumber(ply)
		{
			// Strip initial move number if entered (e.g. 5. Nf6 ->	Nf6)
			var initialMoveNumberMatch = ply.match(/^\d+\.\s*(.*)/);
			if(initialMoveNumberMatch)
			{
				ply = initialMoveNumberMatch[1];
			}
			return ply;
		}

		// Sets result if game is over.
		function setResult(game)
		{
			var result;
			if(game.in_checkmate())
			{
				// turn swaps every move, so if it's white's 'turn', black just won.
				if(game.turn() == 'w')
				{
					result = '0-1';
				}
				else
				{
					result = '1-0';
				}
			}
			else if(game.in_stalemate() || game.insufficient_material())
			{
				result = '1/2-1/2';
			}
			if(result)
			{
				game.header('Result', result);
			}
		}

		/*
		 * Get game (chess.js object), and move (chess.js move object)
		 *
		 * The game will include the latest move if it's valid.  Otherwise, it will be the game corresponding to the old PGN.
		 *
		 * This also sets the Result if the game has ended (this does not include claimed draws).  This part may be refactored out to chess.js later.
		 *
		 * oldPgn - prior PGN
		 * ply - user-entered ply
		 */
		function getGameAndMove(oldPgn, ply)
		{
			ply = stripMoveNumber(ply);

			var game = new Chess();
			game.load_pgn(oldPgn);
			var move = game.move(ply);
			if(!move)
			{
				// Add on potential missing # or + so SAN will be valid.
				var plyRegex = new RegExp('^' + ply + '[+#]$');
				var moves = game.moves();
				for(var i = 0; i < moves.length; i++)
				{
					var match = moves[i].match(plyRegex);
					if(match)
					{
						ply = match[0];
						move = game.move(ply);
						break;
					}
				}
			}

			if(move)
			{
				setResult(game);
			}

			return {
				game: game,
				move: move
			};
		}

		/*
		 * $errorDisplay - error display as jQuery node
		 * moveInfo - Return from getGameAndMove.
		 * ply - ply entered by user
		 */
		function displayIfIllegalPly($errorDisplay, moveInfo, ply)
		{
			var msg;
			$errorDisplay.hide().text('');
			if(!moveInfo.move)
			{
				msg = '\'' + ply + '\' is not currently a valid move.  Please check your algebraic notation.';
				if(moveInfo.game.in_check())
				{
					msg += ' You must move out of check.';
				}
				$errorDisplay.text(msg).show();
			}
		}

		function displayIfIllegalGame($errorDisplay, isValid)
		{
			$errorDisplay.hide().text('');
			if(!isValid)
			{
				$errorDisplay.text('The PGN could not be parsed as a valid game.  Please check it and try again.').show();
			}
		}

		function previewMove()
		{
			var annotationValue = $moveModal.data('annotation').value;
			var ply = $movePly.val();
			var playAsBlack = annotationValue.correspondence.black == authenticatedUsername;

			// Defaults to showing old PGN, unless a valid ply is entered.
			var moveInfo = getGameAndMove(annotationValue.pgn, ply);
			if(ply)
			{
				displayIfIllegalPly($moveModalError, moveInfo, ply);
			}

			previewGame($moveModalError, $moveBoard, $moveMessage, moveInfo.game, undefined, playAsBlack);
		}

		$('#previewMoveBtn').click(previewMove);

		$('#moveBtn').click(function()
		{
			var $btn = $(this);
			$btn.button('loading');
			var $modal = $btn.parents('.modal');
			var previousPost = $modal.data('previousPost');
			var ply = $movePly.val();
			var annotation = $.extend(true, {}, $modal.data('annotation')); // Make a copy so we don't accumulate plies if the post fails.
			var oldPgn = annotation.value.pgn;
			var moveInfo = getGameAndMove(oldPgn, ply);
			displayIfIllegalPly($moveModalError, moveInfo, ply);

			// Ply is valid
			if(moveInfo.move)
			{
				var msg = $moveMessage.val();
				msg = addMention(msg, previousPost.user.username);
				var result = moveInfo.game.header().Result;
				if(result)
				{
					annotation.value.result = result;
				}
				annotation.value.pgn = moveInfo.game.pgn();
				api.posts(msg, previousPost.id, true,
				[
					annotation
				]).done(function()
				{
					$modal.modal('hide');
				}).always(function()
				{
					$btn.button('reset');
				});
			}
			else
			{
				$btn.button('reset');
			}
		});

	}
})();