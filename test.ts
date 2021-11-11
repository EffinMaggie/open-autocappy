/** @format */

import { testModule } from './test/run.js';

import * as qualified from './test/qualified.js';
import * as dated from './test/dated.js';
import * as series from './test/streaming-series.js';

export var testsOK = true;

testModule(qualified).then((ok) => testsOK &&= ok);
testModule(dated).then((ok) => testsOK &&= ok);
testModule(series).then ((ok) => testsOK &&= ok);
