/** @format */

import { Status, Settings } from './dom-interface.js';
import { actors, on, poke, bookend, expect, predicate, tracker } from './declare-events.js';
import {
  DOM,
  Recogniser,
  SpeechAPI,
  SpeechAPIEvent,
  SpeechAPIErrorEvent,
  SpeechAPIResultList,
  SpeechAPIResult,
  SpeechAPIAlternative,
  UpdateData,
} from './caption-branches.js';

type usable = new () => Recogniser;

function pickAPI(): usable | undefined {
  if ('SpeechRecognition' in window) {
    return window['SpeechRecognition'];
  }
  if ('webkitSpeechRecognition' in window) {
    return window['webkitSpeechRecognition'];
  }

  // uh-oh!
  return undefined;
}

function assertUsableAPI(api): asserts api is usable {
  // TODO: consider adding additional runtime checks here

  console.assert(
    api !== undefined,
    'SpeechRecognition API implementation must be available at runtime'
  );
}

const api = pickAPI();
assertUsableAPI(api);

function canStoreTranscript(where: Element): asserts where is HTMLOListElement {
  console.assert(where);
  console.assert(where && where.nodeName.toLowerCase() === 'ol');
}

class settings {
  get lang(): string {
    return Settings.language.value;
  }
  get continuous(): boolean {
    return Settings.continuous.value == 'true';
  }
  get interimResults(): boolean {
    return Settings.interim.value == 'true';
  }
  get maxAlternatives(): number {
    return Number(Settings.alternatives.value);
  }

  adjust = (recogniser: Recogniser) => {
    const want = {
      lang: this.lang,
      continuous: this.continuous,
      interimResults: this.interimResults,
      maxAlternatives: this.maxAlternatives,
    };

    if (recogniser.lang != want.lang) {
      console.log(`changing recogniser language from ${recogniser.lang} to ${want.lang}`);
      recogniser.lang = want.lang;
    }
    if (recogniser.continuous != want.continuous) {
      console.log(
        `changing recogniser continuous mode from ${recogniser.continuous} to ${want.continuous}`
      );
      recogniser.continuous = want.continuous;
    }
    if (recogniser.interimResults != want.interimResults) {
      console.log(
        `changing recogniser interim result mode from ${recogniser.interimResults} to ${want.interimResults}`
      );
      recogniser.interimResults = want.interimResults;
    }
    if (recogniser.maxAlternatives != want.maxAlternatives) {
      console.log(
        `changing recogniser requested max number of alternate parsings from ${recogniser.maxAlternatives} to ${want.maxAlternatives}`
      );
      recogniser.maxAlternatives = want.maxAlternatives;
    }
  };
}

class speech extends api implements Recogniser {
  private readonly settings = new settings();

  private readonly predicates = {
    audio: new tracker(this, 'audiostart', 'audioend', Status.audio),
    sound: new tracker(this, 'soundstart', 'soundend', Status.sound),
    speech: new tracker(this, 'speechstart', 'speechend', Status.speech),
    started: new tracker(this, 'start...', 'end'),
    running: new tracker(this, 'start', 'end', Status.captioning),

    stoppable: new predicate(() => {
      return this.tick >= 25;
    }, actors.none),

    transcribable: new tracker(this, 'process!', 'snapshot...', Status.transcriptPending),
  };

  private ticks: number = 0;

  get tick(): number {
    return this.ticks;
  }

  set tick(now: number) {
    if (now == this.tick) {
      // don't update unless necessary
      return;
    }

    this.ticks = now;

    if (this.tick === 0) {
      poke(this, 'tock');
    } else {
      poke(this, 'tick');
    }

    Status.ticks.value = this.ticks.toString();
  }

  start = () => {
    try {
      super.start();
    } catch (e) {
      Status.lastError.value = e.name;
      Status.lastErrorMessage.value = String(e);
      console.error(e);
      throw e;
    }
  };

  snapshot = () => {
    for (const ol of document.querySelectorAll('.captions ol.history')) {
      canStoreTranscript(ol);

      for (const li of document.querySelectorAll('.captions ol.transcript > li')) {
        li.removeAttribute('data-index');
        if (ol) {
          li.parentNode?.removeChild(li);
          ol.appendChild(li);
        }
      }
      const ts = DOM.fromOl(ol);
      DOM.toOl(ts, ol);
    }
  };

  result = (event: SpeechAPIEvent) => {
    poke(this, 'process?', new UpdateData(event));
  };

  process = (event: CustomEvent) => {
    const data: UpdateData = event.detail;

    if (!data) {
      console.error('bogus event from SpeechRecognition API: ', event);
    }

    let ts = SpeechAPI.fromData(data);
    for (const transcript of document.querySelectorAll('.captions ol.transcript')) {
      canStoreTranscript(transcript);

      DOM.merge(transcript, ts);
    }
  };

  error = (event: SpeechAPIErrorEvent) => {
    Status.lastError.value = event.error;

    switch (event.error) {
      case 'no-speech':
        console.warn('still there?');
        Status.lastErrorMessage.value =
          'microphone is not hearing your voice; if you are still talking, please speak up';
        return;
    }

    console.warn('SpeechRecognition API error', event.error, event.message, event);

    Status.lastErrorMessage.value = event.message;
  };

  nomatch = (event: SpeechAPIEvent) => {
    Status.lastError.value = 'no-match';
    Status.lastErrorMessage.value = 'API reached patience limit';
  };

  idle = () => {
    const tickmod = this.tick % 31;
    if (tickmod == 30) {
      poke(this, 'abort?');
    } else if (tickmod == 25) {
      poke(this, 'stop?');
    } else if (tickmod == 5) {
      poke(this, 'idle');
    }
  };

  private readonly weave = [
    on(this, ['start...'], () => this.settings.adjust(this)),

    on(
      this,
      ['start!'],
      () => (Status.serviceURI.value = this.serviceURI || '[service URL not disclosed]')
    ),

    on(
      this,
      ['start?'],
      expect(bookend(this.start, 'start'), [this.predicates.started, this.predicates.running], false)
    ),

    on(
      this,
      ['stop?'],
      expect(bookend(super.stop, 'stop'), [this.predicates.stoppable], true),
      ['start!'],
      ['abort...', 'stop...']
    ),

    on(this, ['abort?'], bookend(super.abort, 'abort'), ['start!'], ['abort...', 'stop...']),

    on(
      this,
      ['snapshot?', 'speechend', 'end', 'slow', 'idle'],
      expect(bookend(this.snapshot, 'snapshot'), [this.predicates.transcribable], true)
    ),

    on(this, ['pulse'], () => {
      this.tick++;
    }),
    on(this, ['start...', 'result...'], () => {
      this.tick = 0;
    }),

    on(this, ['pulse'], this.idle),

    on(
      this,
      ['pulse', 'end!'],
      expect(() => poke(this, 'start?'), [this.predicates.running], false, true, 'reset')
    ),

    on(this, ['error'], this.error),
    on(this, ['nomatch'], this.nomatch),

    on(this, ['result', 'nomatch'], bookend(this.result, 'result')),

    on(this, ['process?'], bookend(this.process, 'process')),
  ];

  readonly intervalID: number = window.setInterval(() => poke(this, 'pulse'), 1200);

  constructor() {
    super();

    poke(this, 'start?');
  }
}

window.addEventListener('load', () => new speech());
