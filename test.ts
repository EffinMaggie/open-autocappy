import { testModule } from "./test/run.js";

import * as qualified from "./test/qualified.js";
import * as dated from "./test/dated.js";

export var testsOK = true;

testsOK &&= testModule(qualified);
testsOK &&= testModule(dated);
