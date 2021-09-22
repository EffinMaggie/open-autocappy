/** @format */

import { reformat, summary } from './lint.js';
import esMain from 'es-main';

if (esMain(import.meta)) {
  reformat(true).then(summary);
}
