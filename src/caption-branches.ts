/** @format */

import { ONodeUpdater, OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull, sort } from './qualified.js';
import { DateBetween, MDate, now } from './dated.js';

import { Branch } from './caption-branch.js';
import { Branches, Alternatives } from './caption-alternatives.js';
import { Transcript } from './caption-transcript.js';

/**
 * Alternatives are serialised to the DOM when writing output; the Element created with to() has no issues storing all of the data we have, so the from() function should recreate an identical Branch from such an Element.
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
 * Alternatives collect multiple Branch objects into one result, which for
 * the SpeechRecognition API is typically a single phrase, sentence or
 * paragraph - the API doesn't specify, but browser behavior seems to be
 * to only consider full sentences 'final' results, with short phrases
 * only occuring as interim results, e.g. while a single word is being
 * analysed; where exported, those short expressions mostly get merged
 * back into a longer phrase that is also being worked on. Which looks
 * kinda cool even with simple output!
 *
 * Alternatives are formatted as a list items:
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

  fromOl: (node: HTMLOListElement): Transcript => {
    const bs = Array.from(node.querySelectorAll('li[is="caption-alternatives"]')).reduce(
      (bs: Alternatives[], e: HTMLLIElement): Alternatives[] => {
        let branches = e as Alternatives;
        if (branches) {
          bs.push(branches);
        }
        return bs;
      },
      []
    );

    return new Transcript(bs);
  },

  toOl: (ts: Transcript, ol: HTMLOListElement = document.createElement('ol')) => {
    let i: number = 0;
    const t = ol.querySelectorAll('li[is="caption-alternatives"]');
    const tlen = t.length;
    const as = t as Iterable<Alternatives>;

    for (const bs of ts.lines) {
      if (i < tlen) {
        if (bs != as[i]) {
          ol.replaceChild(bs, as[i]);
        }
        i++;
      } else {
        ol.appendChild(bs);
      }
    }

    while (i < tlen) {
      ol.removeChild(as[i]);
      i++;
    }
  },

  merge: (where: HTMLOListElement, ts: Transcript) => {
    const t = DOM.fromOl(where);
    const c: Transcript = t.concat(ts.lines);

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

  fromResult: (result: SpeechAPIResult, idx?: number, timestamp?: number): Alternatives => {
    let bs: Branch[] = [];
    let ets: number = timestamp || Date.now();
    for (let i = 0; i < result.length; i++) {
      const alt = result.item(i);
      if (alt) {
        const branch = SpeechAPI.fromAlternative(alt, result.isFinal, ets);
        bs.push(branch);
      }
    }

    return new Alternatives(bs, idx, result.isFinal);
  },

  fromList: (
    list: SpeechAPIResultList,
    idx?: number,
    length?: number,
    timestamp?: number
  ): Transcript => {
    let ets: number = timestamp || Date.now();
    let ds: Alternatives[] = [];
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
