Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  // Support user id and facebook id
  api.use([
      'underscore',
      'standard-app-packages',
      'accounts-base',
      'accounts-password',
      'accounts-facebook'
  ], ['client', 'server']);



  api.add_files('result_format.js', 'server');
  api.add_files('eval.js', ['client', 'server']);

  api.add_files('helpers.js', 'server');
  api.add_files('git_helpers.js', 'server');

  api.export('ServerEval', ['server', 'client']);
});