/** @format */

import { ONodeUpdater, OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, OuterHull, sort } from './qualified.js';
import { DateBetween, MDate, now } from './dated.js';

import { Branch } from './caption-branch.js';

export class Branches extends OuterHull<Branch> {
  constructor(bs: Iterable<Branch>, public readonly alternatives: Alternatives) {
    super(bs);
  }

  compare(bs: Branches): CompareResult {
    return this.alternatives.compare(bs.alternatives);
  }

  equal(bs: Branches): boolean {
    return this.alternatives.equal(bs.alternatives);
  }
}

export class Alternatives extends HTMLLIElement {
  public readonly branches: Branches;

  constructor(bs: Iterable<Branch>, index?: number, final: boolean = false) {
    super();
    this.setAttribute('is', 'caption-alternatives');

    this.branches = new Branches(bs, this);

    this.index = index;
    this.final = final;

    this.replaceChildren(...this.branches);
  }

  private accessors = {
    classes: new OExplicitNodeUpdater(this, 'class', ''),
    index: new OExplicitNodeUpdater(this, 'data-index', '-1'),
  };

  private model = {
    classes: new Access.Classes(this.accessors.classes),
    index: new Access.Numeric(this.accessors.index),
  };

  get final(): boolean {
    return this.model.classes.has('final');
  }

  set final(final: boolean) {
    if (final) {
      this.model.classes.modify(['abandoned', 'interim'], ['final']);
    } else if (this.abandoned) {
      this.model.classes.modify(['final', 'interim'], ['abandoned']);
    } else {
      this.model.classes.modify(['abandoned', 'final'], ['interim']);
    }
  }

  get index(): number | undefined {
    return this.model.index.number >= 0 ? this.model.index.number : undefined;
  }

  set index(index: number | undefined) {
    if (index === undefined) {
      this.model.index.number = -1;
    } else {
      this.model.index.number = index;
    }
  }

  get abandoned(): boolean {
    return !this.final && this.index === undefined;
  }

  *whenHull(): Generator<MDate> {
    for (const b of this.branches) {
      yield* b.when;
    }
  }

  get when(): DateBetween {
    const hull = new DateBetween(this.whenHull());
    if (hull.start && hull.end) {
      return new DateBetween([hull.start, hull.end]);
    } else {
      return hull;
    }
  }

  concat(bs: Alternatives): Alternatives {
    return new Alternatives(this.branches.catter(bs.branches), this.index, this.final || bs.final);
  }

  compare(bs: Alternatives): CompareResult {
    if (this.index !== undefined && bs.index !== undefined) {
      if (bs.index === this.index) {
        // return 0;
      } else if (this.index < bs.index) {
        return -1;
      } else {
        return 1;
      }
    }

    return this.when.compare(bs.when) || (this.equal(bs) ? 0 : -1);
  }

  equal(bs: Alternatives): boolean {
    if (this.index === bs.index) {
      if (this.when.compare(bs.when) == 0 && bs.when.compare(this.when) == 0) {
        return true;
      }
    }

    return false;
  }
}

customElements.define('caption-alternatives', Alternatives, { extends: 'li' });
