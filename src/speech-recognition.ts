/** @format */

import { Series, StdDev } from './streaming.js';
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

  private ticks: number = 0;

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

  snapshot = (full: boolean = false) => {
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

  process = (event: Event) => {
    let doSnapshot = false;
    const endAfter = event.timeStamp + this.maxProcessTimeAllowance;

    while (this.queued.length > 0 && endAfter > event.timeStamp) {
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
      this.snapshot();
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
        this.abort();
      } else {
        poke(this, 'start?');
      }
    } else if (this.tick == 25) {
      this.stop();
    } else if (this.tick == 7) {
      poke(this, 'idle');
    }
  };

  protected lastTimingSample = 0;
  protected samples = new Series.Sampled([750, 750, 750], 25);
  protected deviation = new StdDev.Deviation<Series.Sampled>(this.samples, 500);

  callbackTimingSample(timingMS: number) {
    // assert timingMS > lastTimingSample, and that it's relative to
    // how long the document is open; this should be perfect for the
    // timeStamp of any Event callback.
    const eventDelay = timingMS - this.lastTimingSample;
    this.lastTimingSample = timingMS;

    // this.samples.sample(eventDelay);
    this.deviation.nextTerm(eventDelay);
  }

  private readonly weave = new listeners(
    [this],
    new actions([
      action
        .make(() => {
          try {
            this.predicates.started.assume = true;
            this.start();
          } catch (e) {
            if (e.name == 'InvalidStateError') {
              // this is only raised if we're already started, adjust our
              // view accordingly
              this.predicates.running.assume = true;
              console.warn('divergent state: start() called while active; adjusting our view to match.');
            } else {
              throw e;
            }
          }
          this.predicates.started.assume = false;
        }, 'start')
        .validp(this.predicates.running.nor(this.predicates.started))
        .reentrantp(predicate.no)
        .asyncp(predicate.yes)
        .meshing()
        .prev(action.make(() => (Status.serviceURI.string = this.serviceURI ?? '')))
        .prev(action.make(() => this.settings.adjust(this)))
        .prev(action.make(() => this.snapshot(true)))
        .prev(action.poke(this, 'start:begin'))
        .next(action.poke(this, 'start:end')),

      action.make(() => this.tick++, 'pulse').naming(),

      action.make(this.result, 'result').upon(['result', 'nomatch']),
      action
        .make(this.process, 'process')
        .reentrantp(predicate.no)
        .asyncp(predicate.yes)
        .upon(['tick']),

      action
        .make(() => (Status.ticks.number = this.ticks))
        .upon(['tick'])
        .asyncp(predicate.yes),
      action
        .make((event: Event) => {
          this.callbackTimingSample(event.timeStamp);
          this.tick = 0;
        })
        .upon([
          'start',
          'end',
          'result',
          'nomatch',
          'error',
          'audiostart',
          'audioend',
          'soundstart',
          'soundend',
          'speechstart',
          'speechend',
        ]),

      action.make(this.ticker).upon(['tick']),

      action.make(this.error, 'error').naming(),
      action.make(this.nomatch, 'nomatch').naming(),

      action
        .make(() => pake(this, 'start?'))
        .validp(this.predicates.running.invert())
        .upon(['pulse', 'end']),
    ])
  );

  private readonly enabled = (this.weave.on = true);

  pulseDelay: number = 500;

  pulsar = () => {
    pake(this, 'pulse');

    // dynamic intervals require setTimeout and resetting on each call;
    // assert that the mean time between API event callbacks is a good
    // interval, and slow us down by a partial standard deviation.
    this.pulseDelay = this.deviation.average + this.deviation.deviation / 4;

    window.setTimeout(this.pulsar, this.pulseDelay);
  }

  constructor() {
    super();

    window.setTimeout(this.pulsar, this.pulseDelay);

    poke(this, 'start?');
  }
}

window.addEventListener('load', () => new speech());
