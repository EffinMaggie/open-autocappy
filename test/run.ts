/** @format */

export type LogFunction = (string, boolean) => boolean;

export interface Testable {
  name: string;
  test?: (log: LogFunction) => boolean;
  asyncTest?: (log: LogFunction) => Promise<boolean>;
}

interface TestableModule {
  name: string;
  tests: Array<Testable>;
}

export const testModule = async (mod: TestableModule): Promise<boolean> => {
  var tests = mod.tests;
  var success = true;

  var log = function (name: string, succ: boolean): boolean {
    process.stdout.write(succ ? '.' : '!' + name);

    success &&= succ;
    return success;
  };

  for (const i in tests) {
    const test: Testable = tests[i];

    process.stdout.write(mod.name + '/' + test.name + ': ');

    let tr = true;

    if (test.test) {
      tr &&= test.test(log)
    }

    if (test.asyncTest) {
      tr &&= await test.asyncTest(log);
    }

    success &&= tr;

    if (tr) {
      process.stdout.write(' OK\n');
    } else {
      process.stdout.write(' FAIL\n');
    }
  }

  return success;
}
