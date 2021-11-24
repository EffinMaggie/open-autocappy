/** @format */

import {
  SpeechRecognitionConstructor,
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionResultList,
  SpeechRecognitionResult,
  SpeechRecognitionAlternative,
} from '../@types/web-speech-api';

import { Series, StdDev } from './streaming.js';
import { Status, Settings } from './dom-interface.js';
import { action, actions, listeners, predicate, tracker } from './declare-events.js';
import { CaptionPredicate } from './caption-predicate.js';
import { SpeechAPI, UpdateData, SpeechAPIUpdate, ErrorUpdate, Fabricate } from './caption-branches.js';
import { TranslatedBranches } from './caption-branch.js';
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
    audio: new tracker(this, ['audiostart'], ['audioend']),
    sound: new tracker(this, ['soundstart'], ['soundend']),
    speech: new tracker(this, ['speechstart'], ['speechend']),
    running: new tracker(this, ['start'], ['end']),
    started: new tracker(this, ['configure'], ['start']),

    recovery: new predicate(() => this.ticks.tick >= 80),
    panic: new predicate(() => this.ticks.tick > 75 && this.ticks.tick < 80),
    zombie: new predicate(() => this.ticks.tick > 50 && this.ticks.tick < 75),
  };

  // protected ticks = document.querySelector('p[is="caption-ticker"]') as Ticker;
  protected ticks = new Ticker();

  protected status = document.querySelector('.captions .status') as HTMLUListElement;
  protected transcript = document.querySelector(
    '.captions ol.transcript[is="caption-transcript"]'
  ) as Transcript;
  protected history = document.querySelector(
    '.captions ol.history[is="caption-transcript"]'
  ) as Transcript;

  private readonly bindings = [
    new CaptionPredicate(this.predicates.started, 'started'),
    new CaptionPredicate(this.predicates.running, 'running'),
    new CaptionPredicate(this.predicates.audio, 'audio'),
    new CaptionPredicate(this.predicates.sound, 'sound'),
    new CaptionPredicate(this.predicates.speech, 'speech'),
    this.ticks,
  ];

  statusBindings = this.status.replaceChildren(...this.bindings);

  snapshot = (full: boolean = false) => {
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
    while (TranslatedBranches.length) {
      const b = TranslatedBranches.shift();
      if (!b) {
        continue;
      }
      this.history.appendChild(Fabricate.Translation(b));
      didMove = true;
    }
    if (didMove) {
      this.transcript.sync();
      this.history.sync();
    }
  };

  queued: UpdateData[] = [];

  result = (event: SpeechRecognitionEvent) =>
    this.queued.push(new SpeechAPIUpdate(event, this.settings.lang));

  process(fullSnapshot: boolean = false) {
    // if there's nothing to do, don't do nothing.
    let transcript: Transcript | undefined = undefined;

    while (this.queued.length) {
      const data = this.queued.shift();

      if (!data) {
        console.error('bogus event from SpeechRecognition API; skipping');
        continue;
      }

      const ts = SpeechAPI.fromData(data);

      if (transcript === undefined) {
        transcript = ts;
      } else {
        transcript.load(ts);
      }
    }

    if (transcript !== undefined) {
      this.transcript.load(transcript);
      this.snapshot(fullSnapshot);
    } else if (fullSnapshot) {
      this.snapshot(true);
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
    this.process(true);

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
      action.make(this.result).upon(['result', 'nomatch']),

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

      action.make(this.error).upon(['error']),
      action.make(this.nomatch).upon(['nomatch']),
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
