/** @format */

import { SpeechRecognitionConstructor, SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent, SpeechRecognitionResultList, SpeechRecognitionResult, SpeechRecognitionAlternative } from '../@types/web-speech-api';

import { Series, StdDev } from './streaming.js';
import { Status, Settings } from './dom-interface.js';
import {
  action,
  actions,
  listeners,
  predicate,
  tracker,
  syncPredicateStyle,
} from './declare-events.js';
import {
  SpeechAPI,
  UpdateData,
  SpeechAPIUpdate,
  ErrorUpdate,
} from './caption-branches.js';
import { Alternatives } from './caption-alternatives.js';
import { Transcript } from './caption-transcript.js';
import { Ticker } from './caption-ticker.js';

function pickAPI(): SpeechRecognitionConstructor | undefined {
  if (window.SpeechRecognition) {
    return window.SpeechRecognition;
  }
  if (window.webkitSpeechRecognition) {
    return window.webkitSpeechRecognition;
  }

  // uh-oh!
  return undefined;
}

function assertUsableAPI(api): asserts api is SpeechRecognitionConstructor {
  // TODO: consider adding additional runtime checks here

  console.assert(
    api !== undefined,
    'SpeechRecognition API implementation must be available at runtime'
  );
}

const api = pickAPI();
assertUsableAPI(api);

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

  adjust = (recogniser: SpeechRecognition) => {
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

class speech extends api implements SpeechRecognition {
  private readonly settings = new settings();

  private readonly predicates = {
    audio: new tracker(this, 'hasAudio', ['audiostart'], ['audioend']),
    sound: new tracker(this, 'hasSound', ['soundstart'], ['soundend']),
    speech: new tracker(this, 'hasSpeech', ['speechstart'], ['speechend']),
    running: new tracker(this, 'isRunning', ['start'], ['end']),
    started: new tracker(this, 'isStarted', ['configure'], ['start']),

    recovery: new predicate(() => this.ticks.tick >= 80),
    panic: new predicate(() => this.ticks.tick > 75 && this.ticks.tick < 80),
    zombie: new predicate(() => this.ticks.tick > 50 && this.ticks.tick < 75),
  };

  protected ticks = document.querySelector('p[is="caption-ticker"]') as Ticker;

  protected transcript = document.querySelector(
    '.captions ol.transcript[is="caption-transcript"]'
  ) as Transcript;
  protected history = document.querySelector(
    '.captions ol.history[is="caption-transcript"]'
  ) as Transcript;

  private readonly bindings = [
    new syncPredicateStyle(this.predicates.audio, Status.audio),
    new syncPredicateStyle(this.predicates.sound, Status.sound),
    new syncPredicateStyle(this.predicates.speech, Status.speech),
    new syncPredicateStyle(this.predicates.running, Status.captioning),
  ];

  snapshotting: number = 0;

  snapshot = async (full: boolean = false) => {
    if (!full && this.snapshotting > 0) {
      console.warn('already snapshotting, cancelling this invocation');
      return;
    }

    this.snapshotting++;

    try {
      let didMove: boolean = false;
      for (const li of this.transcript.querySelectorAll(
        full
          ? 'li[is="caption-alternatives"]'
          : 'li[is="caption-alternatives"].final, li[is="caption-alternatives"].abandoned'
      ) as NodeListOf<Alternatives>) {
        li.index = undefined;
        this.history.appendChild(li);
        didMove = true;
      }
      if (didMove) {
        this.transcript.sync();
        this.history.sync();
      }
    } finally {
      this.snapshotting--;
    }
  };

  queued: UpdateData[] = [];

  result = (event: SpeechRecognitionEvent) => this.queued.push(new SpeechAPIUpdate(event, this.settings.lang));

  processing: number = 0;

  process = async (synchronous: boolean = false) => {
    if (!synchronous && this.processing > 0) {
      // never allow two threads to be processing stuff at the same time,
      // as it won't help performance and the queue and snapshotting steps
      // may not be reentrant. The order of the queue processing should
      // not be changed from the order we got results in.
      console.log('already processing');
      return;
    }

    this.processing++;

    try {
      let doSnapshot = false;

      while (this.queued.length) {
        const data = this.queued.shift();

        if (!data) {
          console.error('bogus event from SpeechRecognition API; skipping');
          continue;
        }

        const ts = SpeechAPI.fromData(data);

        doSnapshot ||= ts.index != this.transcript.index;
        doSnapshot ||= ts.length != this.transcript.length;

        this.transcript.load(ts);
      }

      if (doSnapshot) {
        this.snapshot();
      }
    } finally {
      this.processing--;
    }
  };

  error = (event: SpeechRecognitionErrorEvent) => this.queued.push(new ErrorUpdate(event));

  nomatch = (event: SpeechRecognitionEvent) =>
    this.queued.push(
      new ErrorUpdate(
        event.timeStamp,
        'nomatch',
        'SpeechRecognition API',
        'API did not recognise valid voice inputs and has abandoned any partial results'
      )
    );

  ticker = async () => {
    if (this.predicates.running.fail()) {
      // we should always be running, therefore if we're not, try to
      // start again - the API likes to "d'oh" out randomly.
      this.start();
    } else {
      this.process();
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

    // clear out any pending transcript updates before trying to start,
    // because the API provider will likely recycle ID numbers, which would
    // cause confusing clashes with the interim records.
    await this.process(true);
    await this.snapshot(true);

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
        .make((event: Event) => {
          this.ticks.callbackTimingSample(event.timeStamp);
          this.ticks.tick = 0;
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

      action.make(this.error, 'error').naming(),
      action.make(this.nomatch, 'nomatch').naming(),
    ])
  );

  private readonly weaveTicker = new listeners(
    [this.ticks],
    new actions([action.make(this.ticker).upon(['tick'])])
  );

  private readonly enabled = (this.weave.on = true);
  private readonly enabledTicker = (this.weaveTicker.on = true);

  constructor() {
    super();

    Status.serviceURI.string = this.serviceURI ?? '';

    this.start();
  }
}

window.addEventListener('load', () => new speech());
