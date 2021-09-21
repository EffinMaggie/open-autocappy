import { Dated, DateBetween } from './dated.js';
import { Qualified, QValue, OuterHull, sort } from './qualified.js';

export class Branch implements Qualified {
  when: DateBetween;
  confidence: QValue;
  final: boolean;
  caption: string;

  compare(b: Branch): number {
    // TODO: chaining multiple Qualified implementations really sounds like
    // something that should be a function composition... consider refactoring
    // into something that does this.
    var dc = this.when.compare(b.when);
    
    if (dc === 0) {
      dc = this.confidence.compare(b.confidence);
    }

    return dc;
  }
}

export type Branches = OuterHull<Branch>;
