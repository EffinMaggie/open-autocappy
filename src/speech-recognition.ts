/** @format */

import { Status, Settings } from './dom-interface.js';
import {
  on,
  poke,
  pake,
  bookend,
  expect,
  predicate,
  tracker,
  syncPredicateStyle,
} from './declare-events.js';
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
import { CaptionError } from './caption-error.js';

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
    return Settings.language.string;
  }
  get continuous(): boolean {
    return Settings.continuous.boolean;
  }
  get interimResults(): boolean {
    return Settings.interim.boolean;
  }
  get maxAlternatives(): number {
    return Number(Settings.alternatives.number);
  }

  adjust = (recogniser: Recogniser) => {
    const want = {
      lang: this.lang,
      continuous: this.continuous,
      interimResults: this.interimResults,
      maxAlternatives: this.maxAlternatives,
    };

    if (recogniser.lang != want.lang) {
      recogniser.lang = want.lang;
    }
    if (recogniser.continuous != want.continuous) {
      recogniser.continuous = want.continuous;
    }
    if (recogniser.interimResults != want.interimResults) {
      recogniser.interimResults = want.interimResults;
    }
    if (recogniser.maxAlternatives != want.maxAlternatives) {
      recogniser.maxAlternatives = want.maxAlternatives;
    }
  };
}

class speech extends api implements Recogniser {
  private readonly settings = new settings();
  private readonly slowTickFrequency: number = 60;

  private ticks: number = 0;
  private continuousTicks: number = 0;

  private readonly predicates = {
    audio: new tracker(this, 'hasAudio', ['audiostart'], ['audioend']),
    sound: new tracker(this, 'hasSound', ['soundstart'], ['soundend']),
    speech: new tracker(this, 'hasSpeech', ['speechstart'], ['speechend']),
    started: new tracker(this, 'hasStarted', ['start...'], ['end']),
    running: new tracker(this, 'isRunning', ['start'], ['end']),

    transcribable: new tracker(this, 'isTranscribable', ['process!'], ['snapshot...']),
  };

  private readonly bindings = [
    new syncPredicateStyle(this.predicates.audio, Status.audio),
    new syncPredicateStyle(this.predicates.sound, Status.sound),
    new syncPredicateStyle(this.predicates.speech, Status.speech),
    new syncPredicateStyle(this.predicates.running, Status.captioning),
    new syncPredicateStyle(this.predicates.transcribable, Status.transcriptPending),
  ];

  get tick(): number {
    return this.ticks;
  }

  set tick(now: number) {
    if (now == this.tick) {
      return;
    }

    this.ticks = now;

    poke(this, 'tick');
  }

  protected static historySelector = '.captions ol.history';
  protected static transcriptLineSelector = '.captions ol.transcript > li';
  protected static transcriptSafeLineSelector = `${speech.transcriptLineSelector}.final, ${speech.transcriptLineSelector}.abandoned`;

  snapshot = async (event: Event) => {
    const partial = event.type !== 'start...' && event.type !== 'end';

    for (const ol of document.querySelectorAll(speech.historySelector)) {
      canStoreTranscript(ol);

      for (const li of document.querySelectorAll(
        partial ? speech.transcriptSafeLineSelector : speech.transcriptLineSelector
      )) {
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

  result = (event: SpeechAPIEvent) => pake(this, 'process?', new UpdateData(event));

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
    Status.lastError.string = event.error;

    switch (event.error) {
      case 'no-speech':
        console.warn('still there?');
        Status.lastErrorMessage.string =
          'microphone is not hearing your voice; if you are still talking, please speak up';
        return;
    }

    console.warn('SpeechRecognition API error', event.error, event.message, event);

    Status.lastErrorMessage.string = event.message;
  };

  nomatch = (event: SpeechAPIEvent) => {
    Status.lastError.string = 'no-match';
    Status.lastErrorMessage.string = 'API reached patience limit';
  };

  ticker = () => {
    if (this.tick >= 40) {
      console.error('trying to quit', this);
      poke(this, 'stop?');
    } else if (this.tick == 25) {
      poke(this, 'stop?');
    } else if (this.tick == 7) {
      poke(this, 'idle');
    }
  };

  slowTicker = async () => {
    this.continuousTicks++;

    if (this.continuousTicks > this.slowTickFrequency) {
      this.continuousTicks = 0;
      poke(this, 'slow-tick');
    }
  };

  private readonly weave = [
    on(
      this,
      ['start...'],
      async () => (Status.serviceURI.string = this.serviceURI || '[service URL not disclosed]')
    ),

    on(
      this,
      ['start?'],
      expect(
        bookend(() => this.start(), 'start'),
        [this.predicates.started, this.predicates.running],
        false,
        true
      )
    ),

    on(
      this,
      ['stop?'],
      bookend(() => this.stop(), 'stop'),
      ['start!'],
      ['abort...', 'abort', 'stop...', 'stop']
    ),

    on(
      this,
      ['abort?'],
      bookend(() => this.abort(), 'abort'),
      ['start!'],
      ['abort...', 'abort', 'stop...', 'stop']
    ),

    on(
      this,
      ['start...', 'slow-tick', 'speechend', 'end', 'slow', 'idle'],
      expect(bookend(this.snapshot, 'snapshot'), [this.predicates.transcribable])
    ),

    on(this, ['pulse'], () => this.tick++),
    on(this, ['start...'], () => this.settings.adjust(this)),
    on(this, ['start...', 'result...'], () => (this.tick = 0)),

    on(this, ['tick'], async () => (Status.ticks.number = this.ticks)),
    on(this, ['tick'], this.ticker),
    on(this, ['tick'], this.slowTicker),

    on(
      this,
      ['pulse', 'end!'],
      expect(() => pake(this, 'start?'), [this.predicates.running], false, true, 'reset')
    ),

    on(this, ['error'], this.error),
    on(this, ['nomatch'], this.nomatch),

    on(this, ['result', 'nomatch'], bookend(this.result, 'result')),

    on(this, ['process?'], bookend(this.process, 'process')),
  ];

  readonly intervalID: number = window.setInterval(() => pake(this, 'pulse'), 1200);

  constructor() {
    super();

    pake(this, 'start?');
  }
}

window.addEventListener('load', () => new speech());
