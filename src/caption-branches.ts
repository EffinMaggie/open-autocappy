/** @format */

import { clearContent, updateText, updateClasses, hasClass } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull, sort } from './qualified.js';
import { DateBetween, MDate, now } from './dated.js';

export class Branch implements PartialOrder {
  when: DateBetween;
  confidence: QValue;
  final?: boolean;
  text?: string;
  source?: string;

  constructor(when: DateBetween, confidence: QValue, final?: boolean, text?: string, source?: string) {
    this.when = when;
    this.confidence = confidence;
    this.final = final;
    this.text = text;
    this.source = source;
  }

  compare(b: Branch): CompareResult {
    const q = this.confidence.compare(b.confidence);
    const w = this.when.compare(b.when);

    return w || q;
  }
}

export class Branches extends OuterHull<Branch> {
  index?: number;
  final: boolean;

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

  constructor(bs: Iterable<Branch>, idx: number | undefined, fin: boolean) {
    super(bs);

    this.index = idx;
    this.final = fin;
  }

  concat(bs: Branches): Branches {
    return new Branches(this.catter(bs), this.index, this.final || bs.final);
  }

  /*
  compare(bs: Branches): CompareResult {
    if ((this.index !== undefined) && (bs.index !== undefined)) {
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
*/

  /*
  equal(bs: Branches): boolean {
    if (this.index === bs.index) {
      if ((this.when.compare(bs.when) == 0) && (bs.when.compare(this.when) == 0)) {
        return true;
      }
    }

    return false;
  }
*/
}

export class Transcript extends OuterHull<Branches> {
  readonly resultIndex?: number;
  readonly resultLength?: number;

  static *merge(
    bs: Iterable<Branches>,
    resultIndex?: number,
    resultLength?: number
  ): Generator<Branches> {
    for (const b of bs) {
      yield b;
    }
  }

  constructor(ts: Iterable<Branches>, resultIndex?: number, resultLength?: number) {
    super(Transcript.merge(ts, resultIndex, resultLength));
    this.resultIndex = resultIndex;
    this.resultLength = resultLength;
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
  fromSpan: (node: HTMLSpanElement): Branch => {
    // console.warn(node);
    const _q = node.getAttribute('data-confidence') ?? '';
    const _when = node.getAttribute('data-when') ?? '';

    const f = hasClass(node, 'final') ?? !hasClass(node, 'interim') ?? false;
    const c = new QValue(Number(_q));
    const w = new DateBetween(DateBetween.diffcat(_when));
    const text = node.textContent ?? undefined;

    // console.log(_q, c);
    return new Branch(w, c, f, text);
  },

  fromLi: (node: HTMLLIElement): Branches | undefined => {
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
    const f = hasClass(node, 'final');

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
    if (b.final) {
      updateClasses(span, ['interim'], ['final']);
    } else {
      updateClasses(span, ['final'], ['interim']);
    }
    if (b.confidence) {
      span.setAttribute('data-confidence', b.confidence.toString());
    } else if (span.hasAttribute('data-confidence')) {
      span.removeAttribute('data-confidence');
    }
    span.setAttribute('data-when', b.when.string);
    updateText(span, b.text);
    return span;
  },

  toLi: (bs: Branches, li: HTMLLIElement = document.createElement('li')): HTMLLIElement => {
    if (bs.abandoned) {
      updateClasses(li, ['final'], ['abandoned']);
    } else if (bs.final) {
      updateClasses(li, ['abandoned'], ['final']);
    } else {
      updateClasses(li, ['final', 'abandoned']);
    }
    if (bs.index !== undefined) {
      li.setAttribute('data-index', bs.index.toString());
    } else if (li.hasAttribute('data-index')) {
      li.removeAttribute('data-index');
    }
    li.setAttribute('data-when', bs.when.string);
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

  toOl: (ts: Transcript, ol: HTMLOListElement = document.createElement('ol')): HTMLOListElement => {
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

    return ol;
  },

  merge: (where: HTMLOListElement, ts: Transcript): HTMLOListElement => {
    const t = DOM.fromOl(where);
    const c: Transcript = t.concat(ts);

    return DOM.toOl(c, where);
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
