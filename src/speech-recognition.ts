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
recognition.maxAlternatives = 4;

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

// TODO: allow for user settings instead of hardcoded defaults
// TODO: allow users to turn captions on and off
var setupCaptions = function (recognition: Recogniser) {
  try {
    recognition.start();
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
};

function canStoreTranscript(where?: HTMLElement | null): asserts where is HTMLOListElement {
  console.assert(where);
  console.assert(where && where.nodeName.toLowerCase() === 'ol');
}

let lastEvent: SpeechAPIEvent | undefined;
let tick = 0;

function resultProcessor(event: SpeechAPIEvent) {
  tick = 0;
  lastEvent = event;

  console.log('result handler: ', event);

  let transcript = document.getElementById('transcript');

  // assert that the document is set properly to carry transcriptions
  canStoreTranscript(transcript);

  let ts = SpeechAPI.fromEvent(event);

  DOM.merge(transcript, ts);

  console.log('result handler complete: ', transcript);
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
});

window.setInterval(function () {
  if (isCaptioning) {
    const isOn: boolean = isCaptioning();
    if (isOn) {
      if (tick == 10) {
        recognition.removeEventListener('result', resultProcessor);
        recognition.addEventListener('result', resultProcessor);
        tick++;
      } else if (tick > 25) {
        recognition.stop();
        tick = 0;
      } else {
        tick++;
      }
      return;
    }
  }

  setupCaptions(recognition);
}, 500);

window.addEventListener('load', () => {
  setupCaptions(recognition);
});
