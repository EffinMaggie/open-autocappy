/** @format */

import {
  updateNodeText,
  updateText,
  updateClasses,
  replaceContent,
  hasClass,
} from './dom-manipulation.js';
import { CompareResult, Qualified, QValue, OuterHull, sort } from './qualified.js';
import { Dated, DateBetween, QDate, now } from './dated.js';

export class Branch implements Qualified {
  when: DateBetween;
  confidence: QValue;
  final: boolean;
  caption: string;

  constructor(w: DateBetween, c: QValue, f: boolean, t: string) {
    this.when = w;
    this.confidence = c;
    this.final = f;
    this.caption = t;
  }

  compare(b: Branch): CompareResult {
    // TODO: chaining multiple Qualified implementations really sounds like
    // something that should be a function composition... consider refactoring
    // into something that does this.
    const dc = this.when.compare(b.when);

    return dc == 0 ? this.confidence.compare(b.confidence) : dc;
  }
}

export class Branches extends OuterHull<Branch> {
  index: number | undefined;
  final: boolean;

  constructor(bs: Array<Branch>, idx: number | undefined, final: boolean) {
    super(bs);

    this.index = idx;
    this.final = final;
  }
}

export class Transcript extends OuterHull<Branches> {
  index: number | undefined;

  constructor(ts: Array<Branches>, idx: number | undefined) {
    super(ts);

    this.index = idx;
  }

  final(): Transcript {
    return new Transcript(
      this.filter((bs: Branches): boolean => {
        return bs.final && bs.index >= this.index;
      }),
      this.index
    );
  }

  interim(): Transcript {
    return new Transcript(
      this.filter((bs: Branches): boolean => {
        return !bs.final;
      }),
      this.index
    );
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
  fromSpan: (node: Element): Branch | undefined => {
    if (node.tagName.toLowerCase() !== 'span') {
      return undefined;
    }
    const f = hasClass(node, 'final') || !hasClass(node, 'interim') || false;
    const c = new QValue(Number(node.getAttribute('data-q') || '0'));
    const w = new DateBetween(
      (node.getAttribute('data-when') || '0').split(' ').map((point): QDate => {
        return new QDate(new Date(Number(point)));
      })
    );
    const t = node.textContent;

    return new Branch(w, c, f, t);
  },

  fromLi: (node: Element): Branches | undefined => {
    if (node.tagName.toLowerCase() !== 'li') {
      return undefined;
    }
    const i = node.getAttribute('data-index');
    const idx = i ? Number(i) : undefined;
    const f = hasClass(node, 'final');
    return new Branches(
      Array.from(node.querySelectorAll('span')).map((e: Element): Branch => {
        return DOM.fromSpan(e);
      }),
      idx,
      f
    );
  },

  fromOl: (node: Element): Transcript => {
    if (node.tagName.toLowerCase() !== 'ol') {
      return undefined;
    }
    return new Transcript(
      Array.from(node.querySelectorAll('li')).map((e: Element): Branches => {
        return DOM.fromLi(e);
      }),
      undefined
    );
  },

  toSpan: (b: Branch, where: Element): Element => {
    // TODO: try to identify this node in where and update instead of creating a new one.
    var span = document.createElement('span');
    if (b.final) {
      updateClasses(span, new Set(['interim']), new Set(['final']));
    } else {
      updateClasses(span, new Set(['final']), new Set(['interim']));
    }
    if (b.confidence) {
      span.setAttribute('data-q', b.confidence.q.toString());
    }
    span.setAttribute(
      'data-when',
      b.when
        .map((when: QDate): string => {
          return when.q.getTime().toString();
        })
        .join(' ')
    );
    updateText(span, b.caption);
    return span;
  },

  toLi: (bs: Branches): Element => {
    let li = document.createElement('li');
    if (bs.final) {
      updateClasses(li, new Set(), new Set(['final']));
    } else {
      updateClasses(li, new Set(['final']), new Set());
    }
    if (bs.index !== undefined) {
      if (bs.index) {
        li.setAttribute('data-index', bs.index.toString());
      }
    }
    bs.forEach((b: Branch): void => {
      li.appendChild(DOM.toSpan(b, li));
    });
    return li;
  },
};

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

export const SpeechAPI = {
  fromAlternative: (alt: SpeechAPIAlternative, final: boolean): Branch => {
    return new Branch(new DateBetween([now()]), new QValue(alt.confidence), final, alt.transcript);
  },

  fromResult: (result: SpeechAPIResult, idx: number): Branches => {
    var bs: Array<Branch> = [];
    for (let i = 0; i < result.length; i++) {
      const alt: SpeechAPIAlternative = result.item(i);
      const branch = SpeechAPI.fromAlternative(alt, result.isFinal);
      bs.push(branch);
    }
    return new Branches(bs, idx, result.isFinal);
  },

  fromList: (list: SpeechAPIResultList, idx: number | undefined): Transcript => {
    var ds: Array<Branches> = [];
    for (let i = idx || 0; i < list.length; i++) {
      const result: SpeechAPIResult = list.item(i);
      const branches = SpeechAPI.fromResult(result, i);
      ds.push(branches);
    }
    return new Transcript(ds, idx);
  },

  fromEvent: (event: SpeechAPIEvent): Transcript => {
    return SpeechAPI.fromList(event.results, event.resultIndex);
  },
};
