var doxygen = require('doxygen');

doxygen.downloadVersion().then(function (data) {
  doxygen.createConfig({
    OUTPUT_DIRECTORY: 'documentation',
    INPUT: './',
    RECURSIVE: 'YES',
    GENERATE_HTML: 'YES',
    HTML_OUTPUT: 'doxygen',
    FILE_PATTERNS: ['*.ts', '*.md'],
    EXTENSION_MAPPING: 'ts=Javascript',
    GENERATE_LATEX: 'NO',
    EXCLUDE_PATTERNS: ['*/node_modules/*']
  }, './doxyfile');
  doxygen.run('./doxyfile');
});
