/** @format */

import { CompareResult, PartialOrder, Q, M, OuterHull, FromNumber, ToNumber, FromString, ToString } from './qualified.js';

export class MDate extends M<Date> implements FromNumber, ToString, FromString {
  get number(): number {
    return this.valueOf().getTime();
  }

  set number(n: number) {
    this.value = new Date(n);
  }

  set string(s: string) {
    this.number = Number(s);
  }
}

export class DateBetween extends OuterHull<MDate> implements FromString, ToString {
  get string(): string {
    let start: number = 0;
    let end: number = 0;
    let first: boolean = true;

    for (const d of this) {
      if (first) {
        start = d.number;
        first = false;
        continue;
      }

      end = d.number;
    }

    if (end > start) {
      return '' + String(start) + 'Δ' + String(end - start);
    }

    return String(start);
  }

  static *diffcat(s: string): Generator<MDate> {
     let a = 0;
     for (const dv of s.split('Δ')) {
       a += Number(dv);
       yield new MDate(new Date(a));
     }
  }

  set string(s: string) {
    this.value = DateBetween.diffcat(s);
  }
}

export function now(): MDate {
  return new MDate(new Date(Date.now()));
}
