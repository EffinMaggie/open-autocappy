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

let recognition: Recogniser = new api();

recognition.continuous = true;
recognition.lang = 'en';
recognition.interimResults = true;
recognition.maxAlternatives = 5;

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
  const isOn: undefined | (() => boolean) = isCaptioning;
  if (isOn && isOn()) {
    return;
  }

  work = Promise.resolve();

  try {
    recognition.start();
    tick = 0;
  } catch (e) {
    if (e.name == 'InvalidStateError') {
      // documentation says this is only thrown if speech recognition is on,
      // so ignore this problem.
    } else {
      Status.lastError.value = e.name;
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

function resultProcessor(event: SpeechAPIEvent) {
  const data = {
    results: event.results,
    resultIndex: event.resultIndex,
    resultLength: event.results.length,
  };
  tick = 0;

  work = work.then(() => {
    return new Promise<void>((resolve, reject) => {
      let ts = SpeechAPI.fromList(data.results, data.resultIndex, data.resultLength);

      let transcript = document.getElementById('transcript');

      // assert that the document is set properly to carry transcriptions
      canStoreTranscript(transcript);

      DOM.merge(transcript, ts);

      resolve();
    });
  });
}

recognition.addEventListener('result', resultProcessor);

recognition.addEventListener('error', (event: SpeechAPIErrorEvent) => {
  console.warn('SpeechRecognition API error', event.error, event.message, event);

  Status.lastError.value = event.error;
  Status.lastErrorMessage.value = event.message;

  return recognition.abort();
});

recognition.addEventListener('nomatch', (event) => {
  console.warn('SpeechRecognition API nomatch event', event);
});

recognition.addEventListener('end', (event) => {
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
    if (ts) {
      clearContent(ol);

      DOM.toOl(ts, ol);
    }
  }

  work = work.then(() => setupCaptions(recognition));
});

window.setInterval(() => {
  if (isCaptioning) {
    const isOn: boolean = isCaptioning();
    if (isOn) {
      if (tick > 35) {
        tick = 0;
      } else if (tick == 25) {
        console.warn('stopping');
        recognition.stop();
      } else if (tick == 10) {
        console.warn('event listener reset');
        recognition.removeEventListener('result', resultProcessor);
        recognition.addEventListener('result', resultProcessor);
      }
      tick++;
      Status.ticks.value = 'I' + tick;
      return;
    }
  }

  work = work.then(() => setupCaptions(recognition));
}, 500);

window.addEventListener('load', () => {
  setupCaptions(recognition);
});
