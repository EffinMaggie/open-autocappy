import { OuterHull } from "./qualified.js";
export class Branch {
  compare(b) {
    // TODO: chaining multiple Qualified implementations really sounds like
    // something that should be a function composition... consider refactoring
    // into something that does this.
    const dc = this.when.compare(b.when);
    return dc == 0 ? this.confidence.compare(b.confidence) : dc;
  }
}
export class Branches extends OuterHull {}
