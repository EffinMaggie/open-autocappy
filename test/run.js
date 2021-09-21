/** @format */

export function testModule(mod) {
  var tests = mod.tests;
  var success = true;
  var log = function (name, succ) {
    process.stdout.write(succ ? '.' : '!' + name);
    success && (success = succ);
    return success;
  };
  for (const i in tests) {
    const test = tests[i];
    process.stdout.write(mod.name + '/' + test.name + ': ');
    const tr = test.test(log);
    success && (success = tr);
    if (tr) {
      process.stdout.write(' OK\n');
    } else {
      process.stdout.write(' FAIL\n');
    }
  }
  return success;
}
