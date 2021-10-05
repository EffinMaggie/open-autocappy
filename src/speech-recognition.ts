/** @format */

import { clearContent, addContent, hasClass } from './dom-manipulation.js';
import { Status } from './dom-interface.js';
import { makeStatusHandlers, registerEventHandlers } from './declare-events.js';
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

let api = pickAPI();
assertUsableAPI(api);

class speech extends api implements Recogniser {
  stop(...rest: any) {
    console.error('caption mode: avoiding stopping', this, rest);
    super.stop();
  }

  abort(...rest: any) {
    console.error('caption mode: avoiding aborting', this, rest);
    super.abort();
  }

  removeEventListener(...rest: any) {
    console.error('caption mode: will avoid death', this, rest);
    super.removeEventListener(rest[0], rest[1], rest[2]);
  }

  addEventListener(...rest: any) {
    console.warn('adding: ', this, rest);
    super.addEventListener(rest[0], rest[1], rest[2]);
  }

  dispatchEvent(event: Event): boolean {
    console.log('dipatch: ', this, event);
    return super.dispatchEvent(event);
  }
}

let recognition: Recogniser = new speech();

function applySettings(recognition: Recogniser) {
  recognition.continuous = true;
  recognition.lang = 'en';
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;
}

export const isAudioActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-audio', 'audiostart', 'audioend')
);

export const isSoundActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-sound', 'soundstart', 'soundend')
);

export const isSpeechActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-speech', 'speechstart', 'speechend')
);

export const isCaptioning = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-captioning', 'start', 'end')
);

let tick = 0;
let work = Promise.resolve();

// TODO: allow for user settings instead of hardcoded defaults
// TODO: allow users to turn captions on and off
var setupCaptions = function (recognition: Recogniser) {
  work = work.then(() => {
  if (isCaptioning()) {
    return;
  }

  work = Promise.resolve();

  try {
    applySettings(recognition);
    resetResultProc();

    recognition.start();
    tick = 0;
  } catch (e) {
    if (e.name == 'InvalidStateError') {
      // documentation says this is only thrown if speech recognition is on,
      // so ignore this problem.
    } else {
      Status.lastError.value = e.name;
      console.error(e);
      throw e;
    }
  }

  Status.serviceURI.value = recognition.serviceURI ?? '[service URL not disclosed]';
  });
};

function canStoreTranscript(where?: HTMLElement | null): asserts where is HTMLOListElement {
  console.assert(where);
  console.assert(where && where.nodeName.toLowerCase() === 'ol');
}

const resultProcOpts = {
  capture: false,
  once: false,
  passive: true,
  signal: undefined,
};

const ensureResultProc = () => {
  if (!isCaptioning()) {
    recognition.addEventListener('result', resultProcessor, resultProcOpts);
  }
}

const resetResultProc = () => {
  console.warn('reset handler');
  recognition.removeEventListener('result', resultProcessor, resultProcOpts);

  ensureResultProc();
}

function resultProcessor(event: SpeechAPIEvent) {
  const data = {
    results: event.results,
    resultIndex: event.resultIndex,
    resultLength: event.results.length,
    timestamp: event.timeStamp,
    newfinal: event.results[event.resultIndex ?? 0].isFinal,
  };
  tick = 0;

  if (data.newfinal) {
    work = work.then(ensureResultProc);
  }

  work = work.then(() => {
    return new Promise<void>((resolve, reject) => {
      let ts = SpeechAPI.fromList(data.results, data.resultIndex, data.resultLength, data.timestamp);
      let transcript = document.getElementById('transcript');

      // assert that the document is set properly to carry transcriptions
      canStoreTranscript(transcript);

      DOM.merge(transcript, ts);

      if (data.newfinal) {
        snapshot();
      }

      resolve();
    });
  });
}

recognition.addEventListener('error', (event: SpeechAPIErrorEvent) => {
  console.warn('SpeechRecognition API error', event.error, event.message, event);

  Status.lastError.value = event.error;
  Status.lastErrorMessage.value = event.message;

  work = work.then(recognition.stop.bind(recognition));
});

recognition.addEventListener('nomatch', (event: SpeechAPIEvent) => {
  Status.lastError.value = 'no-match';
  Status.lastError.value = 'timeout trying to transcribe audio, last update before stop()/reset';
  resultProcessor(event);
  work = work.then(recognition.stop.bind(recognition));
});

function snapshot() {
  work = work.then(() => {
  let ol = document.getElementById('prior-session-transcript');
  for (let li of document.querySelectorAll('ol#transcript > li')) {
    li.removeAttribute('data-index');
    if (ol) {
      li.parentNode?.removeChild(li);
      ol.appendChild(li);
    }
  }
  if (ol) {
    canStoreTranscript(ol);
    const ts = DOM.fromOl(ol);
    DOM.toOl(ts, ol);
  }
  }).then(ensureResultProc);
}

recognition.addEventListener('end', snapshot);

const intervalID = window.setInterval(() => {
  if (isCaptioning()) {
      let tickmod = tick % 30;
      if (tickmod == 28) {
        Status.lastError.value = 'voluntary-reset';
        Status.lastErrorMessage.value = 'no results in >= 25 ticks';

        work = work.then(() => setupCaptions(recognition));
        recognition.stop();
      } else if (tickmod % 12 == 8) {
        Status.lastError.value = 'no-result-events';
        Status.lastErrorMessage.value = 'trying to re-register result events';
        resetResultProc();
      } else if (tickmod % 7 == 4) {
        Status.lastError.value = 'stale-event-callback';
        Status.lastErrorMessage.value = 'delayed result event, trying to add handler again';
        ensureResultProc();
      }
      tick++;
      let [l, r] = (tick >= 15) ?
              ['⚪', '⚫'] :
              ['⚫', '⚪'];

      let tickv = l.repeat(tick % 15);
      if (tick >= 15) {
        tickv = tickv.padEnd(15, r);
      }
      Status.ticks.value = tickv; 
      return;
  }

  work = work.then(() => setupCaptions(recognition));
}, 666);

window.addEventListener('load', () => {
  setupCaptions(recognition);
});
