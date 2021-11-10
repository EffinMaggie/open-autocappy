/** @format */

import { Status, Settings } from './dom-interface.js';
import {
  action,
  actions,
  listeners,
  poke,
  pake,
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
    running: new tracker(this, 'isRunning', ['start'], ['end']),
    started: new tracker(this, 'isStarted', ['start:begin'], ['start:end', 'start:exception']),
  };

  private readonly bindings = [
    new syncPredicateStyle(this.predicates.audio, Status.audio),
    new syncPredicateStyle(this.predicates.sound, Status.sound),
    new syncPredicateStyle(this.predicates.speech, Status.speech),
    new syncPredicateStyle(this.predicates.running, Status.captioning),
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

  snapshot = (event: Event) => {
    const full = event.type === 'start' || event.type === 'end';

    for (const ol of document.querySelectorAll(speech.historySelector)) {
      canStoreTranscript(ol);

      for (const li of document.querySelectorAll(
        full ? speech.transcriptLineSelector : speech.transcriptSafeLineSelector
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

  queued: UpdateData[] = [];

  result = (event: SpeechAPIEvent) => this.queued.push(new UpdateData(event));

  get maxProcessTimeAllowance(): number {
    return 100;
  }

  process = async (event: Event) => {
    let doSnapshot = false;
    const endAfter = event.timeStamp + this.maxProcessTimeAllowance;

    while ((this.queued.length > 0) && (endAfter > event.timeStamp)) {
      const data = this.queued.shift();

      if (!data) {
        console.error('bogus event from SpeechRecognition API: ', event);
        continue;
      }

      const ts = SpeechAPI.fromData(data);
      for (const transcript of document.querySelectorAll('.captions ol.transcript')) {
        canStoreTranscript(transcript);

        DOM.merge(transcript, ts);
      }

      doSnapshot = true;
    }

    if (endAfter <= event.timeStamp) {
      console.warn(`exceeded processing time allowance with ${this.queued.length} updates left`);
    }

    if (doSnapshot) {
      this.snapshot(event);
    }
  };

  error = (event: SpeechAPIErrorEvent) => {
    Status.lastError.string = event.error;

    switch (event.error) {
      case 'no-speech':
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
      if (this.predicates.running.ok()) {
        console.error('trying to quit', this);
        this.stop();
      } else {
        console.error('trying to resurrect', this);
        poke(this, 'start?');
      }
    } else if (this.tick == 25) {
      this.stop();
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

  private readonly weave = new listeners(
    [this],
    new actions([
      action
        .make(() => this.start(), 'start')
        .validp(this.predicates.running.nor(this.predicates.started))
        .reentrantp(predicate.no)
        .asyncp(predicate.yes)
        .meshing()
        .prev(action.make(() => (Status.serviceURI.string = this.serviceURI ?? '')))
        .prev(action.make(() => this.settings.adjust(this)))
        .prev(action.make(this.snapshot))
        .prev(action.poke(this, 'start:begin'))
        .next(action.poke(this, 'start:end')),

      action.make(() => this.stop(), 'stop').meshing(),
      action.make(() => this.abort(), 'abort').meshing(),

      action.make(() => this.tick++, 'pulse').naming(),

      action.make(this.result, 'result').upon(['result', 'nomatch']),
      action.make(this.process, 'process').reentrantp(predicate.no).asyncp(predicate.yes).upon(['result', 'tick']),

      action.make(() => (Status.ticks.number = this.ticks)).upon(['tick']).asyncp(predicate.yes),
      action.make(() => (this.tick = 0)).upon(['start', 'end', 'result', 'nomatch', 'error', 'audiostart', 'audioend', 'soundstart', 'soundend', 'speechstart', 'speechend']),

      action.make(this.ticker).upon(['tick']),
      action.make(this.slowTicker).upon(['tick']),

      action.make(this.error, 'error').naming(),
      action.make(this.nomatch, 'nomatch').naming(),

      action
        .make(() => pake(this, 'start?'))
        .validp(this.predicates.running.invert())
        .upon(['pulse', 'end']),
    ])
  );

  private readonly enabled = (this.weave.on = true);

  readonly intervalID: number = window.setInterval(() => pake(this, 'pulse'), 1200);

  constructor() {
    super();

    poke(this, 'start?');
  }
}

window.addEventListener('load', () => new speech());
