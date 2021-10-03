/** @format */

import { clearContent, updateText, updateClasses, hasClass } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull, sort } from './qualified.js';
import { DateBetween, QDate, now } from './dated.js';

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

  *whenHull(): Generator<QDate> {
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

  constructor(bs: Iterable<Branch>, idx: number | undefined, final: boolean) {
    super(bs);

    this.index = idx;
    this.final = final;
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
  static *merge(bs: Iterable<Branches>): Generator<Branches> {
    let m = new Map<string, Branches>();
    for (const b of bs) {
      let append = false;
      let replace = false;

      if (b.index === undefined) {
        yield b;
        continue;
      }

      const id = 'index-' + b.index;
      let current = m.get(id);

      if (current) {
        m.set(id, m?.get(id)?.concat(b) ?? b);
        continue;
      }

      m.set(id, b);
    }
    for (const [_, b] of m) {
      yield b;
    }
  }

  constructor(ts: Iterable<Branches>) {
    super(Transcript.merge(ts));
  }

  *final(): Generator<Branches> {
    return this.filter((bs: Branches): boolean => bs.final);
  }

  *interim(): Generator<Branches> {
    return this.filter((bs: Branches): boolean => !bs.final);
  }

  concat(bs: Iterable<Branches>): Transcript {
    return new Transcript(this.catter(bs));
  }
}

/**
 * Branches are serialised to the DOM when writing output; the Element created with to() has no issues storing all of the data we have, so the from() function should recreate an identical Branch from such an Element.
 *
 * Format:
 *     <span class='interim | final'
 *           data-q?='confidence'
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
    const _q = node.getAttribute('data-confidence') ?? '';
    const _when = node.getAttribute('data-when') ?? '';

    const f = hasClass(node, 'final') ?? !hasClass(node, 'interim') ?? false;
    const c = new QValue(Number(_q));
    const w = new DateBetween(
      _when.split(' ').map((point): QDate => {
        return new QDate(new Date(Number(point)));
      })
    );
    const text = node.textContent ?? undefined;

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

    if (!bs.length) {
      return;
    }

    const _index = node.getAttribute('data-index');
    let idx: number | undefined = undefined;
    if (_index || _index === '0') {
      idx = Number(_index) ?? undefined;
    }
    const f = hasClass(node, 'final');

    return new Branches(bs, idx, f);
  },

  fromOl: (node: HTMLOListElement): Transcript | undefined => {
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

    if (!bs.length) {
      return;
    }

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
    }
    const when: Iterable<string> = b.when.map((when: QDate): string => {
      return when.valueOf().getTime().toString();
    });
    span.setAttribute('data-when', Array.from(when).join(' '));
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
    }
    const when: Iterable<string> = bs.when.map((when: QDate): string => {
      return when.valueOf().getTime().toString();
    });
    li.setAttribute('data-when', Array.from(when).join(' '));
    for (const b of bs) {
      let span = DOM.toSpan(b);
      li.appendChild(span);
    }
    return li;
  },

  toOl: (ts: Transcript, ol: HTMLOListElement = document.createElement('ol')): HTMLOListElement => {
    for (const bs of ts) {
      let li = DOM.toLi(bs);
      ol.appendChild(li);
    }
    return ol;
  },

  merge: (where: HTMLOListElement, ts: Transcript): HTMLOListElement => {
    let t = DOM.fromOl(where);
    let c: Transcript = t?.concat(ts) ?? ts;
    let k = where.id === 'caption' ? new Transcript(c.interim()) : c;

    clearContent(where);

    return DOM.toOl(k, where);
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

export const SpeechAPI = {
  fromAlternative: (alt: SpeechAPIAlternative, final?: boolean): Branch => {
    return new Branch(new DateBetween([now()]), new QValue(alt.confidence), final, alt.transcript);
  },

  fromResult: (result: SpeechAPIResult, idx?: number): Branches => {
    var bs: Branch[] = [];
    for (let i = 0; i < result.length; i++) {
      const alt = result.item(i);
      if (alt) {
        const branch = SpeechAPI.fromAlternative(alt, result.isFinal);
        bs.push(branch);
      }
    }

    return new Branches(bs, idx, result.isFinal);
  },

  fromList: (list: SpeechAPIResultList, idx?: number): Transcript => {
    var ds: Branches[] = [];
    for (let i = idx || 0; i < list.length; i++) {
      const result: SpeechAPIResult = list.item(i);
      const branches = SpeechAPI.fromResult(result, i);
      ds.push(branches);
    }

    return new Transcript(ds);
  },

  fromEvent: (event: SpeechAPIEvent): Transcript => {
    return SpeechAPI.fromList(event.results, event.resultIndex);
  },
};
