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
        const out = outputs.shift();
        if (approx != out ?? -1) {
          console.error(`incorrect series element: ${approx} != ${out}`);
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

async function testProductSeries(log: LogFunction): Promise<boolean> {
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
      start: 1,
      input: [1, 2, 3],
      output: [1, 2, 6],
      expectApproximation: 6,
      expectTerms: 3,
    },
    {
      name: 'assert bias blending',
      start: 1,
      bias: [5],
      input: [1, 2, 3],
      output: [5, 5, 10],
      expectApproximation: 10,
      expectTerms: 3,
    },
  ];

  for (const i in tt) {
    const t = tt[i];
    const sum = new Streaming.Product(new Streaming.Sampled(t.bias), t.start);
    let r = true;

    if (t.input.length > 0) {
      let inputs = Array.from(t.input);
      let outputs = Array.from(t.output);

      sum.term.sample(inputs.shift() ?? -1);
      for await (const approx of sum) {
        const out = outputs.shift();
        if (approx != out ?? -1) {
          console.error(`incorrect series element: ${approx} != ${out}`);
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

async function testPi(log: LogFunction): Promise<boolean> {
  const iterations = 100;
  let r: boolean = true;
  let piDistance = 9999999;

  const pi = new Streaming.Sum<Streaming.LeibnizMadhavaPi>(new Streaming.LeibnizMadhavaPi());

  for await (const approx of pi) {
    const distance = Math.abs(Math.PI - approx);
    if (distance > piDistance) {
      console.error(`delta between approximation and pi is not strictly monotonous: ${distance} > ${piDistance} at tern ${pi.terms}`);
      r = false;
      break;
    }

    piDistance = distance;
    if (pi.terms > iterations) {
      // cool, it worked!
      break;
    }
  }

  if (!log('pi-convergence', r)) {
    return false;
  }

  console.log(`final convergence on ${pi.approximation}; at distance ${piDistance}`);

  return true;
}

export const name = 'streaming-series';

export const tests = [
  { name: 'streaming-sum', asyncTest: testSumSeries },
  { name: 'streaming-product', asyncTest: testProductSeries },
  { name: 'streaming-pi', asyncTest: testPi },
];
