/** @format */

import { clearContent, addContent, hasClass } from './dom-manipulation.js';
import { Status } from './dom-interface.js';
import {
  makeStatusHandlers,
  registerEventHandlers,
  unregisterEventHandlers,
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

type thunk = () => void;
type predicate = () => boolean;

class speech extends api implements Recogniser {
  static readonly yes: predicate = (): boolean => {
    return true;
  }

  static readonly no: predicate = (): boolean => {
    return false;
  }

  isAudioActive: predicate = speech.no;
  isSoundActive: predicate = speech.no;
  isSpeechActive: predicate = speech.no;
  isRegistered: predicate = speech.no;
  isStarted: predicate = speech.no;
  isRunning: predicate = speech.no;
  isAbandoned: predicate = speech.no;

  get hasAudio(): boolean {
    return this.isAudioActive();
  }
  get hasSound(): boolean {
    return this.isSoundActive();
  }
  get hasSpeech(): boolean {
    return this.isSpeechActive();
  }
  get registered(): boolean {
    return this.isRegistered();
  }
  get started(): boolean {
    return this.isStarted();
  }
  get running(): boolean {
    return this.isRunning();
  }
  get abandoned(): boolean {
    return this.isAbandoned();
  }
  get stoppable(): boolean {
    if (this.tick >= 25) {
      console.warn('reset allowed due to excessive ticks without results', this.tick);
      return true;
    }

    return false;
  }


  readonly audioHandlers = makeStatusHandlers('status-audio', 'audiostart', 'audioend');
  readonly soundHandlers = makeStatusHandlers('status-sound', 'soundstart', 'soundend');
  readonly speechHandlers = makeStatusHandlers('status-speech', 'speechstart', 'speechend');
  readonly statusHandlers = makeStatusHandlers('status-captioning', 'start', 'end');
  readonly stopHandler: thunk = this.stop.bind(this);
  readonly abortHandler: thunk = this.abort.bind(this);
  readonly setupHandler: thunk = this.setup.bind(this);
  readonly snapshotHandler: thunk = this.snapshot.bind(this);
  readonly pingHandler: thunk = this.ping.bind(this);
  readonly resultHandler: thunk = this.resultProcessor.bind(this);
  readonly errorEventHandler: thunk = this.errorHandler.bind(this);
  readonly nomatchEventHandler: thunk = this.nomatchHandler.bind(this);

  readonly continuous: boolean = true;
  readonly lang: string = 'en';
  readonly interimResults: boolean = true;
  readonly maxAlternatives: number = 5;
  readonly intervalID: number = window.setInterval(this.pingHandler, 1200);

  tick: number = 0;
  work: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.setup();
  }

  registerEvents(): void {
    if (this.registered) {
      return;
    }

    this.isRegistered = speech.yes;

    this.isAudioActive = registerEventHandlers(this, this.audioHandlers);

    this.isSoundActive = registerEventHandlers(this, this.soundHandlers);

    this.isSpeechActive = registerEventHandlers(this, this.speechHandlers);

    this.isRunning = registerEventHandlers(this, this.statusHandlers);

    this.addEventListener('end', this.snapshotHandler);
    this.addEventListener('result', this.resultProcessor);
    this.addEventListener('error', this.errorEventHandler);
    this.addEventListener('nomatch', this.nomatchEventHandler);
  }

  unregisterEvents(): void {
    if (!this.registered) {
      return;
    }

    this.removeEventListener('nomatch', this.nomatchEventHandler);
    this.removeEventListener('error', this.errorEventHandler);
    this.removeEventListener('result', this.resultProcessor);
    this.removeEventListener('end', this.snapshotHandler);

    this.isRunning = unregisterEventHandlers(this, this.statusHandlers);

    this.isSpeechActive = unregisterEventHandlers(this, this.speechHandlers);

    this.isSoundActive = unregisterEventHandlers(this, this.soundHandlers);

    this.isAudioActive = unregisterEventHandlers(this, this.audioHandlers);

    this.isRegistered = speech.no;
  }

  start(): void {
    if (!this.started && !this.abandoned) {
      this.registerEvents();

      super.start();

      this.isStarted = speech.yes;
    }
  }

  stop(): void {
    if (!this.stoppable) {
      console.error('caption mode: avoiding stopping', this);
    } else {
      super.stop();

      this.isStarted = speech.no;
    }
  }

  abort(): void {
    super.abort();

    this.unregisterEvents();

    this.isStarted = speech.no;
  }

  abandon() {
    if (!this.abandoned) {
      this.isAbandoned = speech.yes;

      this.stop();
      this.unregisterEvents();
    }
  }

  // TODO: allow for user settings instead of hard-coded defaults
  // TODO: allow users to turn captions on and off
  setup(): void {
    if (this.running || this.abandoned) {
      return;
    }

    this.work = Promise.resolve();

    try {
      this.start();
    } catch (e) {
      Status.lastError.value = e.name;
      Status.lastErrorMessage.value = String(e);
      console.error(e);
      throw e;
    }

    Status.serviceURI.value = this.serviceURI || '[service URL not disclosed]';
  }

  snapshot() {
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
  }

  resultProcessor(event: SpeechAPIEvent) {
    const results = event.results;
    const idx = event.resultIndex;
    const len = event.results.length;
    const timestamp = event.timeStamp;

    this.tick = 0;

    this.work = this.work.then(() => {
      let ts = SpeechAPI.fromList(results, idx, len, timestamp);
      for (const transcript of document.querySelectorAll('.captions ol.transcript')) {
        canStoreTranscript(transcript);

        DOM.merge(transcript, ts);
      }
    });
  }

  errorHandler(event: SpeechAPIErrorEvent) {
    console.warn('SpeechRecognition API error', event.error, event.message, event);

    Status.lastError.value = event.error;
    Status.lastErrorMessage.value = event.message;

    this.work = this.work.then(this.abortHandler);
  }

  nomatchHandler(event: SpeechAPIEvent) {
    Status.lastError.value = 'no-match';
    Status.lastErrorMessage.value = 'timeout trying to transcribe audio, last update before stop()/reset';
    this.resultProcessor(event);
  }

  ping() {
    if (this.abandoned) {
      window.clearInterval(this.intervalID);
      this.snapshot();
      return;
    }

    if (this.running) {
      const tickmod = this.tick & 63;
      if(tickmod == 60) {
        Status.lastError.value = 'abandoned';
        Status.lastErrorMessage.value = 'still no results after reset, abandoning instance';

        this.abandon();
        new speech();
      } else if (tickmod == 28) {
        Status.lastError.value = 'voluntary-reset';
        Status.lastErrorMessage.value = 'no results in >= 25 ticks';

        this.stop(); // this is expected to cause a restart automatically
      }
 
      this.tick++;
      const [l, r] = this.tick >= 15 ? ['⚪', '⚫'] : ['⚫', '⚪'];

      let tickv = l.repeat(this.tick % 15);
      if (this.tick >= 15) {
        tickv = tickv.padEnd(15, r);
      }
      Status.ticks.value = tickv;
      return;
    }

    if (!this.running && !this.abandoned) {
      this.work = this.work.then(this.setupHandler);
    }
  }
}

window.addEventListener('load', () => new speech());
