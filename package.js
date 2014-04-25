Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  // Support user id and facebook id
  api.use('standard-app-packages', ['client', 'server']);
  api.use('accounts-facebook', ['client', 'server']);

  api.add_files('server/result_format.js', 'server');
  api.add_files('server/eval.js', 'server');
  api.add_files('server/helpers.js', 'server');
  api.add_files('server/git_helpers.js', 'server');
  api.add_files('client/client.js', 'client')

  api.export('ServerEval', ['server', 'client']);
});