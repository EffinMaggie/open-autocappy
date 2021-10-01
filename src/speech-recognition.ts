/** @format */

import {
  clearContent,
  addContent,
  hasClass,
} from './dom-manipulation.js';
import {
  Status
} from './dom-interface.js';
import { makeStatusHandlers, registerEventHandlers } from './declare-events.js';
import {
  DOM,
  Recogniser,
  SpeechAPI,
  SpeechAPIEvent,
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

// REFACTOR: make event handlers declarative
export var isAudioActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-audio', 'audiostart', 'audioend')
);

export var isSoundActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-sound', 'soundstart', 'soundend')
);

export var isSpeechActive = registerEventHandlers(
  recognition,
  makeStatusHandlers('status-speech', 'speechstart', 'speechend')
);

function canStoreTranscript(where?: HTMLElement | null): asserts where is HTMLOListElement {
  console.assert(where);
  console.assert(where && where.nodeName.toLowerCase() === 'ol');
}

registerEventHandlers(recognition, {
  result: {
    name: 'result',
    handler: (event: SpeechAPIEvent) => {
      // FIX: handle disappearing nodes properly
      // TODO: create separate type for qualified output sets
      if (!event.results) {
        // nothing to do
        console.error('skipping result handler: API did not provide results');
        return;
      }

      let caption = document.getElementById('caption');
      let transcript = document.getElementById('transcript');

      // assert that the document is set properly to carry transcriptions
      canStoreTranscript(caption);
      canStoreTranscript(transcript);

      let ts = SpeechAPI.fromEvent(event);

      DOM.merge(caption, ts);
      DOM.merge(transcript, ts);
    },
  },

  error: {
    name: 'error',
    handler: function (event) {
      console.warn('SpeechRecognition API error', event.error, event.message);

      Status.lastError.value = event.error;
      Status.lastErrorMessage.value = event.message;
    },
  },

  nomatch: {
    name: 'nomatch',
    handler: function (event) {
      console.warn('SpeechRecognition API nomatch event', event);
    },
  },
});

export var isCaptioning = registerEventHandlers(
  recognition,
  (function () {
    var r = makeStatusHandlers('status-captioning', 'start', 'end');

    return {
      start: {
        name: 'start',
        handler: function (event) {
          Status.lastError.value = '';
          Status.lastErrorMessage.value = '';

          r.start.handler(event);
        },
      },
      end: {
        name: 'end',
        handler: function (event) {
          r.end.handler(event);

          let ol = document.getElementById('prior-session-transcript');
          for (let li of document.querySelectorAll('ol#transcript > li[data-index]')) {
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

          // reset speech API and get back in there.
          // there ought to be some error checking and somesuch, but in general the
          // intent for this project is to be used in OBS to add closed captions,
          // which means we should handle disconnects as gracefully as is reasonably
          // possible.
          //
          // future versions will require flags and proper configurations and the like.
          window.setTimeout(function () {
            if (!r.status()) {
              setupCaptions(recognition);
            }
          }, 5000);
        },
      },
      status: r.status,
    };
  })()
);

window.addEventListener('load', () => {
  setupCaptions(recognition);
});
