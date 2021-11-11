/** @format */

import { LogFunction, Testable } from './run.js';
import { QValue, sort } from '../src/qualified.js';

class extendedPartialOrder extends QValue {
  isZero?: boolean;

  constructor(qval: number, z?: boolean) {
    super(qval);

    this.isZero = z;
  }
}

function testSort(log: LogFunction): boolean {
  const tt: Array<{
    name: string;
    have: Array<extendedPartialOrder>;
    expect: Array<extendedPartialOrder>;
  }> = [
    {
      name: 'no sort needed',
      have: [new extendedPartialOrder(1)],
      expect: [new extendedPartialOrder(1)],
    },
    {
      name: 'invert',
      expect: [
        new extendedPartialOrder(0.1),
        new extendedPartialOrder(0.2),
        new extendedPartialOrder(0.3),
      ],
      have: [
        new extendedPartialOrder(0.3),
        new extendedPartialOrder(0.2),
        new extendedPartialOrder(0.1),
      ],
    },
    {
      name: 'negative',
      expect: [
        new extendedPartialOrder(-0.1),
        new extendedPartialOrder(0),
        new extendedPartialOrder(0.3),
      ],
      have: [
        new extendedPartialOrder(0.3),
        new extendedPartialOrder(0),
        new extendedPartialOrder(-0.1),
      ],
    },
    {
      name: 'negative with extra fields',
      expect: [
        new extendedPartialOrder(-0.1),
        new extendedPartialOrder(0, true),
        new extendedPartialOrder(0.3, false),
      ],
      have: [
        new extendedPartialOrder(0.3, false),
        new extendedPartialOrder(0, true),
        new extendedPartialOrder(-0.1),
      ],
    },
  ];

  for (const i in tt) {
    const t = tt[i];
    let have = t.have;
    let r = true;

    sort(have);

    if (have.length != t.expect.length) {
      console.error(have, '!=', t.expect);
      r = false;
    } else
      for (const x in have) {
        if (have[x].valueOf() !== t.expect[x].valueOf()) {
          console.error(have, '!=', t.expect);
          r = false;
        }
        if (have[x].isZero !== t.expect[x].isZero) {
          console.error(have, '!=', t.expect);
          r = false;
        }
      }

    if (!log(t.name, r)) {
      return false;
    }
  }

  return true;
}

export const name = 'qualified';

export const tests = [{ name: 'sort', test: testSort }];
