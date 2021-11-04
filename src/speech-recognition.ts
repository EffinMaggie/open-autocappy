/** @format */

import { Status, Settings } from './dom-interface.js';
import {
  makeStatusHandlers,
  registerEventHandlers,
  unregisterEventHandlers,
  handler,
  on,
  bookend,
  must,
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
  };

  static readonly no: predicate = (): boolean => {
    return false;
  };

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
    return this.started && this.isRunning();
  }

  notRunning(): boolean {
    return !this.running;
  }
  unstarted(): boolean {
    return !this.started;
  }

  get stoppable(): boolean {
    if (this.tick >= 25) {
      console.warn('reset allowed due to excessive ticks without results', this.tick);
      return true;
    }

    return false;
  }

  private static registerEventsWhen: string[] = ['start?'];
  private static registerEventsUntil: string[] = ['abort!', 'stop!'];

  on(
    upon: Iterable<string>,
    call: handler,
    after: Iterable<string> = speech.registerEventsWhen,
    until: Iterable<string> = speech.registerEventsUntil
  ): handler {
    return on(this, upon, call.bind(this), after, until);
  }

  bookend(call: handler, name: string = call.name, detail?: any): handler {
    return bookend(call, name, detail, this);
  }

  must(call: handler, terms: Iterable<predicate>, name: string = call.name, detail?: any): handler {
    return must(call, terms, name, detail, this);
  }

  readonly audioHandlers = makeStatusHandlers(this, Status.audio, 'audiostart', 'audioend');
  readonly soundHandlers = makeStatusHandlers(this, Status.sound, 'soundstart', 'soundend');
  readonly speechHandlers = makeStatusHandlers(this, Status.speech, 'speechstart', 'speechend');
  readonly statusHandlers = makeStatusHandlers(this, Status.captioning, 'start', 'end');

  readonly registerOn: handler = this.on(['start...'], this.registerEvents);
  readonly fortifyOn: handler = this.on(['start...'], this.fortify);

  readonly startOn: handler = this.on(
    ['start?'],
    this.must(this.bookend(this.start), [this.notRunning]),
    ['Creation']
  );

  readonly stopOn: handler = this.on(['stop?'], this.stop, ['start!'], ['abort!', 'stop!']);

  readonly abortOn: handler = this.on(['abort?'], this.abort, ['start!'], ['stop!']);

  readonly snapshotOn: handler = this.on(
    ['speechend', 'end', 'slow', 'idle'],
    this.bookend(this.snapshot),
    ['process!'],
    ['snapshot...']
  );

  readonly idleOn: handler = this.on(['pulse'], this.idle);
  readonly pulseOn: handler = this.on(['pulse'], this.pulse);
  readonly reviveOn: handler = this.on(['pulse', 'end'], this.revive, ['Creation']);
  readonly refreshOn: handler = this.on(['start!'], this.refresh);
  readonly deadPOn: handler = this.on(['dead?'], this.dead);
  readonly errorOn: handler = this.on(['error'], this.error);
  readonly nomatchOn: handler = this.on(['nomatch'], this.nomatch);
  readonly resultOn: handler = this.on(['result', 'nomatch'], this.result);
  readonly processOn: handler = this.on(['process?'], this.bookend(this.process));

  get lang(): string {
    console.log(Settings.language.value);
    return Settings.language.value;
  }
  get continuous(): boolean {
    console.log(Settings.continuous.value);
    return Settings.continuous.value == 'true';
  }
  get interimResults(): boolean {
    console.log(Settings.interim.value);
    return Settings.interim.value == 'true';
  }
  get maxAlternatives(): number {
    console.log(Settings.alternatives.value);
    return Number(Settings.alternatives.value);
  }
  readonly intervalID: number = window.setInterval(this.ping.bind(this), 1200);

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
      this.poke('tock');
    } else {
      this.poke('tick');
    }

    Status.ticks.value = this.ticks.toString();
  }

  refresh() {
    Status.serviceURI.value = this.serviceURI || '[service URL not disclosed]';
  }

  poke(ev: string, relay?: Event | UpdateData) {
    return this.dispatchEvent(new CustomEvent(ev, { detail: relay }));
  }

  constructor() {
    super();

    this.poke('Creation');
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
  }

  fortify(): void {
    super.lang = this.lang;
    super.continuous = this.continuous;
    super.interimResults = this.interimResults;
    super.maxAlternatives = this.maxAlternatives;
  }

  start(event?: Event): void {
    try {
      this.tick = 0;
      super.start();
    } catch (e) {
      Status.lastError.value = e.name;
      Status.lastErrorMessage.value = String(e);
      Status.lastErrorTime.value = event?.timeStamp.toString() ?? 'NaN';
      console.error(e);
      throw e;
    }

    this.isStarted = speech.yes;
  }

  stop(): void {
    if (!this.stoppable) {
      console.error('caption mode: avoiding stopping', this);
      return;
    }

    this.poke('stop...');

    super.stop();

    this.isStarted = speech.no;

    this.poke('stop!');
  }

  abort(): void {
    this.poke('abort...');

    super.abort();

    this.isStarted = speech.no;

    this.poke('abort!');
  }

  snapshot(): void {
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

  result(event: SpeechAPIEvent) {
    this.tick = 0;
    this.poke('process?', new UpdateData(event));
  }

  process(event: CustomEvent) {
    const data: UpdateData = event.detail;

    if (!data) {
      console.error('bogus event from SpeechRecognition API: ', event);
    }

    let ts = SpeechAPI.fromData(data);
    for (const transcript of document.querySelectorAll('.captions ol.transcript')) {
      canStoreTranscript(transcript);

      DOM.merge(transcript, ts);
    }
  }

  error(event: SpeechAPIErrorEvent) {
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
  }

  nomatch(event: SpeechAPIEvent) {
    Status.lastError.value = 'no-match';
    Status.lastErrorMessage.value = 'API reached patience limit';
  }

  pulse() {
    this.tick++;
  }

  dead() {
    Status.lastError.value = 'too-quiet';
    Status.lastErrorMessage.value = 'no results for over 25 ticks';

    this.poke('stop?');
  }

  idle() {
    const tickmod = this.tick % 30;
    if (tickmod == 28) {
      this.poke('dead?');
    } else if (tickmod == 5) {
      this.poke('idle');
    }
  }

  revive() {
    if (this.running) {
      // already in target state
      return;
    }

    this.poke('start?');
  }

  ping() {
    this.poke('pulse');
  }
}

window.addEventListener('load', () => new speech());
