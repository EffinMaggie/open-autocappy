/** @format */

import { CompareResult, Qualified, Q, OuterHull } from './qualified.js';

export class QDate extends Q<Date> {}

export interface Dated extends Qualified {
  absorb(a: QDate): Dated;
}

export class DateBetween extends OuterHull<QDate> implements Dated {
  constructor(a: Array<QDate>) {
    super(a);
  }

  absorb(a: QDate): DateBetween {
    return new DateBetween(this.concat([a]));
  }
}

export function now(): QDate {
  return new QDate(new Date(Date.now()));
}
