/** @format */

import { ONodeUpdater, OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull, sort } from './qualified.js';
import { DateBetween, MDate, now } from './dated.js';

export class Branch implements PartialOrder {
  constructor(
    public when: DateBetween,
    public confidence: QValue,
    public final?: boolean,
    public text?: string,
    public source?: string,
    public language?: string
  ) {
    // trivial constructor
  }

  compare(b: Branch): CompareResult {
    const q = this.confidence.compare(b.confidence);
    const w = this.when.compare(b.when);

    return w || q;
  }
}

export class Branches extends OuterHull<Branch> {
  constructor(bs: Iterable<Branch>, public index?: number, public final?: boolean) {
    super(bs);
  }

  get abandoned(): boolean {
    return !this.final && this.index === undefined;
  }

  *whenHull(): Generator<MDate> {
    for (const b of this) {
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

  concat(bs: Branches): Branches {
    return new Branches(this.catter(bs), this.index, this.final || bs.final);
  }

  compare(bs: Branches): CompareResult {
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

  equal(bs: Branches): boolean {
    if (this.index === bs.index) {
      if (this.when.compare(bs.when) == 0 && bs.when.compare(this.when) == 0) {
        return true;
      }
    }

    return false;
  }
}

export class Transcript extends OuterHull<Branches> {
  constructor(
    ts: Iterable<Branches>,
    public readonly resultIndex?: number,
    public readonly resultLength?: number
  ) {
    super(Transcript.merge(ts, resultIndex, resultLength));
  }

  static *merge(
    ts: Iterable<Branches>,
    resultIndex?: number,
    resultLength?: number
  ): Generator<Branches> {
    let finalIndices = new Set<number>();
    let abandonedIndices = new Set<number>();

    let byIndex = new Map<number, Branches>();

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
      const bs: Branches = idVal[1];

      if (finalIndices.has(index)) {
        yield new Branches(bs, index, true);
      } else if (abandonedIndices.has(index)) {
        yield new Branches(bs, undefined, false);
      } else {
        // anything left is interim results
        yield new Branches(bs, index, false);
      }
    }
  }

  concat(bs: Iterable<Branches>, resultIndex?: number, resultLength?: number): Transcript {
    return new Transcript(
      this.catter(bs),
      resultIndex ?? this.resultIndex ?? 0,
      resultLength ?? this.resultLength
    );
  }
}

/**
 * Branches are serialised to the DOM when writing output; the Element created with to() has no issues storing all of the data we have, so the from() function should recreate an identical Branch from such an Element.
 *
 * Format:
 *     <span class='interim | final'
 *           data-confidence?='confidence'
 *           data-when?='[point...]'>caption<span>
 *
 * All data members of Branch are covered by this represantion, so conceptually we expect that:
 *
 *     let branch: Branch;
 *     DOM.from(DOM.to(branch)) == branch;
 *
 * Branches collect multiple Branch objects into one result, which for
 * the SpeechRecognition API is typically a single phrase, sentence or
 * paragraph - the API doesn't specify, but browser behavior seems to be
 * to only consider full sentences 'final' results, with short phrases
 * only occuring as interim results, e.g. while a single word is being
 * analysed; where exported, those short expressions mostly get merged
 * back into a longer phrase that is also being worked on. Which looks
 * kinda cool even with simple output!
 *
 * Branches are formatted as a list items:
 *
 *     <li class?='final'
 *         data-index?='idx'>[branch...]</li>
 *
 * These list items will contain the span elements of several branches.
 * Multiple branches are themselves collected like this:
 *
 *     <ol id='caption'>[interim branch...]</ol>
 *     <ol id='transcript'>[branches...]</ol>
 *
 * The output will contain both of those nodes, however if the id exists
 * when creating the output, the original nodes are updated.
 *
 * In these ordered lists, the list items are sorted based on the time
 * frame they were captioned - start and end time is calculated based on
 * the contained branches as a transitive hull over all of them. Meanwhile
 * those branches are themselves sorted within each result, using the
 * time frame, in the same manner, but also such that confidence values
 * will be in ascending order - if the API implementation provides
 * confidence values, that is.
 *
 * This means that for finalised branches, if there are multiple Branch
 * nodes which are themselves final, the last such node should always be
 * the one with the highest confidence value. This should make it easy
 * to disambiguate with CSS selectors, such that applications hopefully
 * won't be prone to picking the rather comically terrible and disturbing
 * transcriptions that some of the online APIs can provide, as the API
 * implementations, if providing confidence values and multiple results,
 * don't seem to do any sorting, and client applications often either
 * show all or very bad results by asserting that the last node would be
 * the best and final result, when the API specs require no such thing.
 *
 * Note that we try our best to provide the full output, including bad
 * guesses that aren't finalised; that's why there can still be interim
 * nodes under a finalised list item. There is some effort to remove
 * prefixes that are redundant by being fully absorbed into longer interim
 * nodes, however this is entirely best-effort, and will explicitly try
 * to avoid removing any rejected guesses, so that given the right kind
 * of CSS, the rejections can be shown for interested users, alongside
 * the confidence values and the exact time span.
 */
export const DOM = {
  models: {
    branch: class {
      constructor(public readonly node: HTMLSpanElement) {}

      private attributes = {
        classes: new OExplicitNodeUpdater(this.node, 'class', ''),

        confidence: new OExplicitNodeUpdater(this.node, 'data-confidence', '-1'),

        when: new OExplicitNodeUpdater(this.node, 'data-when', '0'),

        text: new OExplicitNodeUpdater(this.node, undefined, '0'),
      };

      classes = new Access.Classes(this.attributes.classes);
      confidence = new Access.Numeric(this.attributes.confidence);
      when = new Access.Storage(this.attributes.when);
      text = new Access.Storage(this.attributes.text);
    },

    alternatives: class {
      constructor(
        public readonly node: HTMLLIElement,
        public readonly classes = new OExplicitNodeUpdater(node, 'class', ''),
        public readonly index = new OExplicitNodeUpdater(node, 'data-index', '-1'),
        public readonly when = new OExplicitNodeUpdater(node, 'data-when', '0')
      ) {}
    },
  },

  fromSpan: (node: HTMLSpanElement): Branch => {
    const value = new DOM.models.branch(node);

    const f = value.classes.has('final') ?? !value.classes.has('interim') ?? false;
    const c = new QValue(Number(value.confidence.number));
    const w = new DateBetween(DateBetween.diffcat(value.when.string));
    const t = value.text.string;

    // console.log(_q, c);
    return new Branch(w, c, f, t);
  },

  fromLi: (node: HTMLLIElement): Branches | undefined => {
    const updateClass = new OExplicitNodeUpdater(node, 'class', '');

    const bs = Array.from(node.querySelectorAll('span')).reduce(
      (b: Branch[], e: HTMLSpanElement): Branch[] => {
        let branch = DOM.fromSpan(e);
        if (branch) {
          b.push(branch);
        }
        return b;
      },
      []
    );

    let idx: number | undefined = undefined;
    if (node.hasAttribute('data-index')) {
      idx = Number(node.getAttribute('data-index'));
    }
    const f = new Access.Classes(updateClass).has('final');

    return new Branches(bs, idx, f);
  },

  fromOl: (node: HTMLOListElement): Transcript => {
    const bs = Array.from(node.querySelectorAll('li')).reduce(
      (bs: Branches[], e: HTMLLIElement): Branches[] => {
        let branches = DOM.fromLi(e);
        if (branches) {
          bs.push(branches);
        }
        return bs;
      },
      []
    );

    return new Transcript(bs);
  },

  toSpan: (b: Branch, span: HTMLSpanElement = document.createElement('span')): HTMLSpanElement => {
    const value = new DOM.models.branch(span);

    if (b.final) {
      value.classes.modify(['interim'], ['final']);
    } else {
      value.classes.modify(['final'], ['interim']);
    }

    value.confidence.number = b.confidence.value;
    value.when.string = b.when.string;
    value.text.string = b.text ?? '';
    return span;
  },

  toLi: (bs: Branches, li: HTMLLIElement = document.createElement('li')): HTMLLIElement => {
    const value = new DOM.models.alternatives(li);

    if (bs.abandoned) {
      new Access.Classes(value.classes).modify(['final'], ['abandoned']);
    } else if (bs.final) {
      new Access.Classes(value.classes).modify(['abandoned'], ['final']);
    } else {
      new Access.Classes(value.classes).modify(['final', 'abandoned']);
    }

    value.index.value = bs.index?.toString() ?? '-1';
    value.when.value = bs.when.string;

    const spans = li.getElementsByTagName('span');
    const slen = spans.length;
    let i: number = 0;

    for (const b of bs) {
      if (i < slen) {
        const child = spans[i];
        DOM.toSpan(b, child);
        i++;
      } else {
        let span = DOM.toSpan(b);
        li.appendChild(span);
      }
    }

    for (const k = i; i < slen; i++) {
      li.removeChild(spans[k]);
      i++;
    }
    return li;
  },

  toOl: async (ts: Transcript, ol: HTMLOListElement = document.createElement('ol')) => {
    let i: number = 0;
    const t = ol.getElementsByTagName('li');
    const tlen = t.length;

    for (const bs of ts) {
      if (i < tlen) {
        const child = t[i];
        DOM.toLi(bs, child);
        i++;
      } else {
        const li = DOM.toLi(bs);
        ol.appendChild(li);
      }
    }

    while (i < tlen) {
      ol.removeChild(t[i]);
      i++;
    }
  },

  merge: async (where: HTMLOListElement, ts: Transcript) => {
    const t = DOM.fromOl(where);
    const c: Transcript = t.concat(ts);

    DOM.toOl(c, where);
  },
};

export interface Recogniser extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  serviceURI?: string;

  constructor();

  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechAPIAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechAPIResult {
  length: number;
  isFinal: boolean;

  item(i: number): SpeechAPIAlternative | null;
}

export interface SpeechAPIResultList {
  length: number;

  item(i: number): SpeechAPIResult;
}

export interface SpeechAPIEvent extends Event {
  resultIndex: number;
  results: SpeechAPIResultList;
}

export interface SpeechAPIErrorEvent extends Event {
  error: string;
  message: string;
}

export class UpdateData {
  results: SpeechAPIResultList;
  index: number;
  length: number;
  timestamp: number;

  constructor(event: SpeechAPIEvent) {
    this.results = event.results;
    this.index = event.resultIndex ?? 0;
    this.length = event.results?.length ?? 0;
    this.timestamp = event.timeStamp ?? -1;
  }
}

export const SpeechAPI = {
  fromAlternative: (alt: SpeechAPIAlternative, final?: boolean, timestamp?: number): Branch => {
    let ets: number = timestamp || Date.now();
    return new Branch(
      new DateBetween([new MDate(ets)]),
      new QValue(alt.confidence),
      final,
      alt.transcript,
      'speech-api'
    );
  },

  fromResult: (result: SpeechAPIResult, idx?: number, timestamp?: number): Branches => {
    let bs: Branch[] = [];
    let ets: number = timestamp || Date.now();
    for (let i = 0; i < result.length; i++) {
      const alt = result.item(i);
      if (alt) {
        const branch = SpeechAPI.fromAlternative(alt, result.isFinal, ets);
        bs.push(branch);
      }
    }

    return new Branches(bs, idx, result.isFinal);
  },

  fromList: (
    list: SpeechAPIResultList,
    idx?: number,
    length?: number,
    timestamp?: number
  ): Transcript => {
    let ets: number = timestamp || Date.now();
    let ds: Branches[] = [];
    for (let i = idx ?? 0; i < (length ?? list.length); i++) {
      const result: SpeechAPIResult = list.item(i);
      const branches = SpeechAPI.fromResult(result, i, ets);
      ds.push(branches);
    }

    return new Transcript(ds, idx, length);
  },

  fromData: (data: UpdateData): Transcript => {
    return SpeechAPI.fromList(data.results, data.index, data.length, data.timestamp);
  },

  fromEvent: (event: SpeechAPIEvent): Transcript => {
    return SpeechAPI.fromData(new UpdateData(event));
  },
};
