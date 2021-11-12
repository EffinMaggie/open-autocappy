/** @format */

import { Series, StdDev } from './streaming.js';
import { Status, Settings } from './dom-interface.js';
import {
  action,
  actions,
  listeners,
  poke,
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
    started: new tracker(this, 'isStarted', ['configure'], ['start']),

    recovery: new predicate(() => this.tick >= 80),
    panic: new predicate(() => this.tick > 75 && this.tick < 80),
    zombie: new predicate(() => this.tick > 50 && this.tick < 75),
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

  process = async (event: Event) => {
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
    if (this.predicates.running.fail()) {
      // we should always be running, therefore if we're not, try to
      // start again - the API likes to "d'oh" out randomly.
      this.start();
    }

    if (this.predicates.running.ok()) {
      if (this.predicates.panic.ok()) {
        // resetting didn't work, we haven't heard from the API in a long
        // time - relative to its normal response rate, even - so keep
        // trying, harder, to stop it, or revive it.
        this.abort();
      }

      if (this.predicates.zombie.ok()) {
        // it's been a while since we heard from the API, assume it went
        // zombie, so try and restart it.
        this.stop();
      }
    }
  };

  protected lastTimingSample?: number;
  protected samples = new Series.Sampled([600, 600, 600], 25);
  protected deviation = new StdDev.Deviation<Series.Sampled>(this.samples, 600);

  callbackTimingSample(timingMS: number) {
    const lastTimingSample = this.lastTimingSample;

    // always update the last sample
    this.lastTimingSample = timingMS;

    if (lastTimingSample !== undefined) {
      // assert timingMS > lastTimingSample, and that it's relative to
      // how long the document is open; this should be perfect for the
      // timeStamp of any Event callback.
      const eventDelay = timingMS - lastTimingSample;

      this.samples.sample(eventDelay);
      this.deviation.nextTerm(eventDelay);
    }
  }

  async start() {
    if (this.predicates.recovery.ok()) {
      console.warn(
        'API unresponsive and undying - asserting state has diverged, ignoring all sanity checks until resynchronised.'
      );
    } else {
      if (this.predicates.started.ok()) {
        console.warn(
          'rejecting start(): our state indicates start() is already running on another thread, refusing reentrant calls.'
        );
        return;
      }

      if (this.predicates.running.ok()) {
        console.warn('rejecting start(): our state indicates SpeechRecognition is already active.');
        return;
      }
    }

    this.predicates.started.assume = true;

    this.settings.adjust(this);
    this.snapshot(true);

    try {
      super.start();
    } catch (e) {
      if (e.name == 'InvalidStateError') {
        // this is only raised if we're already started, adjust our
        // view accordingly
        console.warn('divergent state: start() called while active; adjusting our view to match.');
        console.log(
          'calling start() while started is not an error, according to the API docs; it is (vocally) ignored - and the only way to determine if the API is still running'
        );
        this.predicates.running.assume = true;
      } else {
        this.predicates.started.assume = false;
        throw e;
      }
    }

    this.predicates.started.assume = false;
  }

  private readonly weave = new listeners(
    [this],
    new actions([
      action.make(this.result, 'result').upon(['result', 'nomatch']),
      action
        .make(this.process, 'process')
        .reentrantp(predicate.no)
        .asyncp(predicate.yes)
        .upon(['tick']),

      action
        .make((event: Event) => {
          this.callbackTimingSample(event.timeStamp);
          this.tick = 0;
        })
        .asyncp(predicate.yes)
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

      action.make(() => this.tick++, 'pulse').naming(),
      action
        .make(() => (Status.ticks.number = this.tick))
        .asyncp(predicate.yes)
        .upon(['tick']),
      action.make(this.ticker).upon(['tick']),

      action.make(this.error, 'error').naming(),
      action.make(this.nomatch, 'nomatch').naming(),
    ])
  );

  private readonly enabled = (this.weave.on = true);

  get pulseDelay(): number {
    // dynamic intervals require setTimeout() and resetting on each call;
    // assert that the mean time between API event callbacks is a good
    // interval, and slow us down by a partial standard deviation.
    //
    // the fraction applied to the deviation ranges from .25 to 6, scaling
    // linearly with ticks in range 0 to 100 - this allows for very fast
    // responses while the API is very actively talking with us, but a
    // gradual decay in load for zombie or recovery cases, to give the
    // browser some breathing room.
    return (
      Math.max(this.deviation.average, 50) +
      (this.deviation.deviation * (0.25 + this.tick * 5.75)) / 100
    );
  }

  get maxProcessTimeAllowance(): number {
    // limit speech API update processing to half the pulse delay.
    //
    // since the pulse delay scales with uninterrupted ticks, this means
    // we have relatively little time in times when the browser is hitting
    // us with lots of updates, while backing off in case we accrue a
    // backlog or the browser is slowing down for other reasons, allowing
    // us to catch up in those cases and ideally take some load off the
    // browser UI threads.
    return this.pulseDelay / 2;
  }

  pulsar = () => {
    // set timeout BEFORE any potentially lengthy processing happens, so
    // the calculated delay more closely reflects intent.
    window.setTimeout(this.pulsar, this.pulseDelay);

    // synchronous processing should be fine here - we already requested
    // another pulse, and timeout deliveries are supposed to be async.
    poke(this, 'pulse');
  };

  constructor() {
    super();

    Status.serviceURI.string = this.serviceURI ?? '';

    this.start();

    window.setTimeout(this.pulsar, this.pulseDelay);
  }
}

window.addEventListener('load', () => new speech());
