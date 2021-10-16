/** @format */

import { LogFunction, TestFunction, Testable } from './run.js';
import { MDate, DateBetween } from '../src/dated.js';
import { sort } from '../src/qualified.js';

class carrier extends DateBetween {
  message: string;

  constructor(when: Array<number>, msg: string) {
    let a = Array<MDate>();

    for (const ts of when) {
      a.push(new MDate(ts));
    }
    super(a);

    this.message = msg;
  }
}

function testSort(log: LogFunction): boolean {
  const tt: Array<{
    name: string;
    have: Array<carrier>;
    expect: Array<string>;
  }> = [
    {
      name: 'ensure correct sorting by date',
      have: [
        new carrier([2020], 'Y2k'),
        new carrier([1986], 'sunglasses at night'),
        new carrier([1995], 'pokemon?'),
      ],
      expect: ['sunglasses at night', 'pokemon?', 'Y2k'],
    },
    {
      name: 'validate expected overlap behavior',
      have: [
        new carrier([20200101, 20210101], 'last'),
        new carrier([20200101, 20200201], 'shorter'),
        new carrier([19951201], 'first'),
        new carrier([20200501, 20240501], 'tail'),
        new carrier([20210601, 20200501], 'strange'),
        new carrier([20200501, 20210501], 'charm'),
      ],
      expect: ['first', 'shorter', 'last', 'charm', 'strange', 'tail'],
    },
    { name: 'ensure empty-safe', have: [], expect: [] },
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
        if (have[x].message != t.expect[x]) {
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

export const name = 'dated';

export const tests = [{ name: 'sort', test: testSort }];
