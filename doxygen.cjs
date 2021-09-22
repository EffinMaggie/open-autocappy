/** @format */

var doxygen = require('doxygen');

doxygen.downloadVersion().then(function (data) {
  doxygen.run('./doxyfile');
});
