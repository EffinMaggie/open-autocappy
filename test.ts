import { testModule } from './test/run.js';

import * as qualified from './test/qualified.js';

var testsOK = true;

testsOK &&= testModule(qualified);
