/** @format */

import { CompareResult, Qualified, Q, OuterHull } from './qualified.js';

export class QDate extends Q<Date> {}

export class DateBetween extends OuterHull<QDate> {}

export function now(): QDate {
  return new QDate(new Date(Date.now()));
}
