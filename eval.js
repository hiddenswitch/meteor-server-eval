ServerEval = {
	version: "0.5",
	helpers: {},
	results: function() {
		return ServerEval._results.find({}, {
			sort: {
				eval_time: -1
			}
		});
	},
	metadata: function() {
		return ServerEval._metadata.find({
			version: this.version
		});
	},
	watch: function() {
		return ServerEval._watch.find();
	},
	removeWatch: function(id) {
		Meteor.call('serverEvalRemoveWatch', id);
	},
	eval: function(expr, options) {
		Meteor.call('serverEvalEval', expr, options);
	},
	execute: function(command, args) {
		Meteor.apply('serverEvalExecute', command, args);
	},
	clear: function() {
		Meteor.call('serverEvalClear');
	},
    allowed: function(id) {
        // A user who isn't logged in can never use the console
        if (_.isUndefined(id) ||
            _.isUndefined(Meteor.settings) ||
            _.isUndefined(Meteor.settings.permissions) ||
            _.isUndefined(Meteor.settings.permissions.console) ||
            !_.isArray(Meteor.settings.permissions.console)) {
            return false;
        }

        // Get the facebook user id if it exists
        var user = Meteor.users.findOne({_id: id, "services.facebook.id": {$exists: true}}, {fetch: {"services.facebook.id": 1}});
        var fbId = null;
        if (user != null) {
            fbId = user.services.facebook.id;
        }

        // Does the console permissions list contain this id?
        return (_.contains(Meteor.settings.permissions.console, id) ||
            _.contains(Meteor.settings.permissions.console, fbId) ||
            _.contains(Meteor.settings.permissions.console, null));
    }
};

if (Meteor.isClient) {
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
    Deps.autorun(function() {
        Meteor.subscribe("server-eval-metadata");
    });

	ServerEval._watch = new Meteor.Collection("server-eval-watch");
    Deps.autorun(function() {
        Meteor.subscribe("server-eval-watch");
    });

	ServerEval._results = new Meteor.Collection("server-eval-results");
	Deps.autorun(function() {
        Meteor.subscribe("server-eval-results");
    });
}

if (Meteor.isServer) {
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
	Meteor.publish("server-eval-metadata", function() {
        if (!ServerEval.allowed(this.userId)) {
            throw new Meteor.Error(403, "Permission denied.");
            return;
        }

        updateMetadata();
		return ServerEval.metadata();
	});

	ServerEval._watch = new Meteor.Collection("server-eval-watch");
	Meteor.publish("server-eval-watch", function() {
        if (!ServerEval.allowed(this.userId)) {
            throw new Meteor.Error(403, "Permission denied.");
            return;
        }

		return ServerEval.watch();
	});

	ServerEval._results = new Meteor.Collection("server-eval-results", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-results", function() {
        if (!ServerEval.allowed(this.userId)) {
            throw new Meteor.Error(403, "Permission denied.");
            return;
        }

		return ServerEval.results();
	});

	Meteor.startup(function() {
		//refresh watches
		var watches = ServerEval._watch.find().fetch();
		_.each(watches, function(watch) {
			Meteor.call('serverEvalEval', watch.expr, {
				'package': watch.watch_scope,
				watch: true
			});
		});
	});

	var estimatedObjectSize = function(object) {
		var objectList = [];
		var calculateSize = function(value) {
			var bytes = 0;

			if (typeof value === 'boolean') {
				bytes = 4;
			} else if (typeof value === 'string') {
				bytes = value.length * 2;
			} else if (typeof value === 'number') {
				bytes = 8;
			} else if (_.isObject(value) && objectList.indexOf(value) === -1) {
				objectList[objectList.length] = value;
				for (var i in value) {
					bytes += i.length * 2; //key size
					bytes += calculateSize(value[i]); //value size
				}
			}
			return bytes;
		};
		return calculateSize(object);
	};

	var evalExpression = function(expr, options) {
		options = options || {};
		var pkg = options.package;

		var scope = "server-eval";
		var result;
		var _eval = function(expr) {
			//without wrapping function other scope e.g. Npm undefined
			return eval(expr);
		};

		//determine scope
		if (Package[pkg]) {
			var scoped_eval = findEval(pkg);
			if (scoped_eval) {
				_eval = scoped_eval; //use scoped eval
				scope = pkg;
			} else {
				scope = "server-eval[" + pkg + " not supported]";
			}
		} else if (pkg) {
			scope = "server-eval[no " + pkg + " package]";
		}

		var eval_exec_time = Date.now();
		try {
			//run eval in package scope / fallback to eval in current scope
			result = _eval(options.autocomplete ? '_.keys(' + expr + ')' : expr);
		} catch (e) {
			//error in eval
			result = e;
		}
		eval_exec_time = Date.now() - eval_exec_time;

		var est_size = estimatedObjectSize(result);

		var result_obj = {
			eval_time: Date.now(),
			eval_exec_time: eval_exec_time,
			expr: expr,
			scope: scope,
			size: est_size
		}; //at the moment 5MB result limit to prevent long freezes
		if (!options.ignore_size && est_size > 5 * 1024 * 1024) {
			result_obj.result = {
				____TYPE____: '[Error]',
				err: 'Object size too high, IGNORE if you really want to.. but expect freezes ;-)',
				size_error: true
			};
		} else {
			result_obj.result = prettyResult(result);
		}
		return result_obj;
	};

	Meteor.methods({
		'serverEvalEval': function(expr, options) {
            if (!ServerEval.allowed(this.userId)) {
                throw new Meteor.Error(403, "Permission denied.");
                return;
            }

			if (!expr || expr.length === 0) return;

			options = options || {};
			var pkg = options.package;
			var autocomplete = options.autocomplete;

			var result_obj = evalExpression(expr, options);

			_.extend(result_obj, options);

			//match keys to autocomplete search
			if (autocomplete && result_obj.result.____TYPE____ !== '[Error]') {
				var completions = [];
				_.each(result_obj.result, function(value) {
					if (!options.search || value.match(new RegExp("^" + options.search))) {
						completions.push(value);
					}
				});
				result_obj.result = completions;
			} else if (autocomplete) {
				result_obj.result.stack = null;
				result_obj.result.err = "autocomplete failed, no object";
			}

			//console.time("insert new result time");
			if (options.watch) {
				result_obj.watch_scope = pkg;
				result_obj.result = JSON.stringify(result_obj);
				//create new or update result for watched expression
				ServerEval._watch.upsert({
					expr: expr,
					watch_scope: pkg
				}, result_obj);
			} else {
				ServerEval._results.insert(result_obj);
			}
			//console.timeEnd("insert new result time");
		},
		'serverEvalExecute': function(command, scope, args) {
            if (!ServerEval.allowed(this.userId)) {
                throw new Meteor.Error(403, "Permission denied.");
                return;
            }

			if (!command || command.length < 2) return;

			args = args || [];

			var helper = command.substr(1);
			var eval_exec_time = Date.now();
			var result;

			var new_result = function(result, options) {
				options = options || {};
				eval_exec_time = Date.now() - eval_exec_time;

				var result_obj = {
					eval_time: Date.now(),
					eval_exec_time: eval_exec_time,
					expr: command + ' ' + args.join(' '),
					scope: helper + '@' + (scope || appName()),
					result: prettyResult(result),
					helper: true
				};

				_.extend(result_obj, options);

				ServerEval._results.insert(result_obj);
			};

			try {
				if (typeof ServerEval.helpers[helper] === 'function') {
					result = ServerEval.helpers[helper](scope, args, new_result);
				} else {
					result = executeCommand(helper, scope, args, new_result);
				}
				if (!result) {
					return; //async
				}
			} catch (e) {
				//error in eval
				result = e;
			}
			new_result(result);
		},
		'serverEvalClear': function() {
            if (!ServerEval.allowed(this.userId)) {
                throw new Meteor.Error(403, "Permission denied.");
                return;
            }

			ServerEval._results.remove({});
		},
		'serverEvalRemoveWatch': function(id) {
            if (!ServerEval.allowed(this.userId)) {
                throw new Meteor.Error(403, "Permission denied.");
                return;
            }

			ServerEval._watch.remove({
				_id: id
			});
		}
	});
}
