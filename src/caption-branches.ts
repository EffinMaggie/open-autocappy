/** @format */

import { ONodeUpdater, OExplicitNodeUpdater, Access } from './dom-manipulation.js';
import { CompareResult, PartialOrder, QValue, OuterHull, sort } from './qualified.js';
import { DateBetween, MDate, now } from './dated.js';

import { Branch } from './caption-branch.js';
import { Branches, Alternatives } from './caption-alternatives.js';
import { Transcript } from './caption-transcript.js';

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
