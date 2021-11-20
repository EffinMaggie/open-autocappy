/** @format */

import { ONodeUpdater, OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { OuterHull } from './qualified.js';

import { Branch } from './caption-branch.js';
import { Branches, Alternatives } from './caption-alternatives.js';

export class Lines extends OuterHull<Alternatives> {
  constructor(as: Iterable<Alternatives> = [], public readonly transcript: Transcript) {
    super(Lines.merge(as, transcript.index, transcript.length));
  }

  static *merge(
    ts: Iterable<Alternatives>,
    resultIndex?: number,
    resultLength?: number
  ): Generator<Alternatives> {
    let finalIndices = new Set<number>();
    let abandonedIndices = new Set<number>();

    let byIndex = new Map<number, Alternatives>();

    for (const bs of ts) {
      const index = bs.index;

      if (index === undefined) {
        yield bs;
        continue;
      }

      const indexVal = byIndex.get(index);

      const isFinal: boolean =
        bs.final ?? ((resultIndex !== undefined && index < resultIndex) || finalIndices.has(index));
      const isAbandoned: boolean =
        !isFinal &&
        (bs.abandoned ??
          ((resultLength !== undefined && index >= resultLength) || abandonedIndices.has(index)));

      if (isFinal && !finalIndices.has(index)) {
        finalIndices.add(index);

        // it is possible that the index is also in the abandoned set; I mean,
        // actually it shouldn't be possible, but the signal is weak and the
        // API is hella funky.
        //
        // we don't need to remove the index from the other set, fortunately,
        // as long as we always check for finality before abandonment. Yay.
      }

      if (isAbandoned && !abandonedIndices.has(index)) {
        abandonedIndices.add(index);
      }

      byIndex.set(index, indexVal === undefined ? bs : indexVal.concat(bs));
    }

    for (const idVal of byIndex) {
      const index: number = idVal[0];
      const bs: Alternatives = idVal[1];

      if (finalIndices.has(index)) {
        yield new Alternatives(bs.branches, index, true);
      } else if (abandonedIndices.has(index)) {
        yield new Alternatives(bs.branches, undefined, false);
      } else {
        // anything left is interim results
        yield new Alternatives(bs.branches, index, false);
      }
    }
  }
}

export class Transcript extends HTMLOListElement {
  public lines: Lines;

  constructor(as: Iterable<Alternatives>, index?: number, length?: number) {
    super();
    this.setAttribute('is', 'caption-transcript');

    this.adopt(as, index, length);
  }

  sync() {
    this.adopt(
      this.querySelectorAll('li[is="caption-alternatives"]') as NodeListOf<Alternatives>,
      this.index,
      this.length
    );
  }

  adopt(as: Iterable<Alternatives>, index?: number, length?: number) {
    this.index = index;
    this.length = length;

    this.lines = new Lines(as, this);

    this.replaceChildren(...this.lines);
  }

  take(ts: Iterable<Alternatives>) {
    this.adopt(this.lines.concat(ts), this.index, this.length);
  }

  load(ts: Transcript) {
    this.adopt(this.lines.concat(ts.lines), ts.index, ts.length);
  }

  append(as: Alternatives) {
    this.adopt(this.lines.concat([as]), this.index, this.length);
  }

  private accessors = {
    index: new OExplicitNodeUpdater(this, 'data-index', '-1'),
    length: new OExplicitNodeUpdater(this, 'data-length', '-1'),
  };

  private model = {
    index: new Access.Numeric(this.accessors.index),
    length: new Access.Numeric(this.accessors.length),
  };

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

  get length(): number | undefined {
    return this.model.length.number >= 0 ? this.model.length.number : undefined;
  }

  set length(length: number | undefined) {
    if (length === undefined) {
      this.model.length.number = -1;
    } else {
      this.model.length.number = length;
    }
  }

  concat(bs: Iterable<Alternatives>, index?: number, length?: number): Transcript {
    return new Transcript(this.lines.catter(bs), index ?? this.index ?? 0, length ?? this.length);
  }
}

customElements.define('caption-transcript', Transcript, { extends: 'ol' });
