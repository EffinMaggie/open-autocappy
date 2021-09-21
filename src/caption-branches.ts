import { Dated, DateBetween } from "./dated.js";
import {
  CompareResult,
  Qualified,
  QValue,
  OuterHull,
  sort,
} from "./qualified.js";

export class Branch implements Qualified {
  when: DateBetween;
  confidence: QValue;
  final: boolean;
  caption: string;

  compare(b: Branch): CompareResult {
    // TODO: chaining multiple Qualified implementations really sounds like
    // something that should be a function composition... consider refactoring
    // into something that does this.
    const dc = this.when.compare(b.when);

    return dc == 0 ? this.confidence.compare(b.confidence) : dc;
  }
}

export class Branches extends OuterHull<Branch> {}
