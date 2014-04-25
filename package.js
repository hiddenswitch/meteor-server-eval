Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  api.use(['standard-app-packages'], ['client', 'server']);

  // Support user id and facebook id
  api.use('accounts-password',['client','server']);
  api.use('accounts-facebook',['client','server']);

  api.export('ServerEval');

  api.add_files('server/result_format.js', 'server');
  api.add_files('server/eval.js', 'server');
  api.add_files('client/client.js', 'client');
  api.add_files('server/helpers.js', 'server');
  api.add_files('server/git_helpers.js', 'server');

  api.add_files('helpers.js', 'server');
  api.add_files('git_helpers.js', 'server');
});