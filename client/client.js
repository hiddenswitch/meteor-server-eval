/**
 * @author Benjamin Berman
 * © 2012 All Rights Reserved
 **/
ServerEval = {};

ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
Deps.autorun(function () {
    Meteor.subscribe("server-eval-metadata");
});

ServerEval._watch = new Meteor.Collection("server-eval-watch");
Deps.autorun(function () {
    Meteor.subscribe("server-eval-watch");
});

ServerEval._results = new Meteor.Collection("server-eval-results");
Deps.autorun(function () {
    Meteor.subscribe("server-eval-results");
});