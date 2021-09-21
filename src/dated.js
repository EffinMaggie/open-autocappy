import { Q, OuterHull } from "./qualified.js";
export class QDate extends Q {}
export class DateBetween extends OuterHull {
  constructor(a) {
    super(a);
  }
  absorb(a) {
    return new DateBetween(this.where().concat([a]));
  }
}
