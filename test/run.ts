export type LogFunction = (string, boolean) => boolean;
export type TestFunction = (log: LogFunction) => boolean;

export interface Testable {
  name: string;
  test: TestFunction;
}

interface TestableModule {
  name: string;
  tests: Array<Testable>;
}

export function testModule(mod: TestableModule): boolean {
  var tests = mod.tests;
  var success = true;

  var log = function (name: string, succ: boolean): boolean {
    process.stdout.write(succ ? "." : "!" + name);

    success &&= succ;
    return success;
  };

  for (const i in tests) {
    const test: Testable = tests[i];

    process.stdout.write(mod.name + "/" + test.name + ": ");
    const tr = test.test(log);
    success &&= tr;

    if (tr) {
      process.stdout.write(" OK\n");
    } else {
      process.stdout.write(" FAIL\n");
    }
  }

  return success;
}
