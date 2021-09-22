/** @format */

import { globby } from 'globby';
const ignore = ['!node_modules/**/*', '!documentation/doxygen/**/*', '!package-lock.json'];
const lintPatterns = ['**/*.cjs', '**/*.ts', '**/*.json'];
const formatPatterns = lintPatterns.concat(['**/*.css', '**/*.html', '**/*.md']);

export var lint = globby(lintPatterns.concat(ignore));
export var format = globby(formatPatterns.concat(ignore));
