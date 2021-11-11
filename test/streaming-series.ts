/** @format */

import { LogFunction, Testable } from './run.js';
import { Streaming } from '../src/streaming-series.js';

async function testSumSeries(log: LogFunction): Promise<boolean> {
  const tt: Array<{
    name: string;
    start: number;
    bias?: number[];
    input: number[];
    output: number[];
    expectApproximation: number;
    expectTerms: number;
  }> = [
    {
      name: 'assert user-defined start values',
      start: 42,
      input: [],
      output: [],
      expectApproximation: 42,
      expectTerms: 0,
    },
    {
      name: 'assert [1,2,3] = 6',
      start: 0,
      input: [1, 2, 3],
      output: [1, 3, 6],
      expectApproximation: 6,
      expectTerms: 3,
    },
    {
      name: 'assert bias blending',
      start: 0,
      bias: [5],
      input: [1, 2, 3],
      output: [5, 6, 8],
      expectApproximation: 8,
      expectTerms: 3,
    },
  ];

  for (const i in tt) {
    const t = tt[i];
    const sum = new Streaming.Sum(new Streaming.Sampled(t.bias), t.start);
    let r = true;

    if (t.input.length > 0) {
      let inputs = Array.from(t.input);
      let outputs = Array.from(t.output);

      sum.term.sample(inputs.shift() ?? -1);
      for await (const approx of sum) {
        if (approx != outputs.shift() ?? -1) {
          console.error(`incorrect series element: ${approx}`);
          r = false;
        }

        if (!inputs.length || !outputs.length) {
          break;
        }

        sum.term.sample(inputs.shift() ?? -1);
      }

      if (inputs.length || outputs.length) {
        console.error('input/output arrays must use all values');
        r = false;
      }
    }

    if (sum.approximation != t.expectApproximation) {
      console.error(`approximation mismatch: ${sum.approximation} != ${t.expectApproximation}`);
      r = false;
    }

    if (sum.terms != t.expectTerms) {
      console.error(`terms mismatch: ${sum.terms} != ${t.expectTerms}`);
      r = false;
    }

    if (!log(t.name, r)) {
      return false;
    }
  }

  return true;
}

export const name = 'streaming-series';

export const tests = [{ name: 'streaming-sum', asyncTest: testSumSeries }];
