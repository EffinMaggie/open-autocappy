/** @format */

import {
  clearContent,
  addContent,
  replaceContent,
  updateNodeText,
  updateClasses,
  hasClass,
} from './dom-manipulation.js';
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

  console.assert(api !== undefined, 'SpeechRecognition API implementation must be available at runtime');
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
      updateNodeText('status-last-error', e.name);
      throw e;
    }
  }

  updateNodeText('status-service', recognition.serviceURI);
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

      // DOM.merge(caption, ts);
      DOM.merge(transcript, ts);
    },
  },

  error: {
    name: 'error',
    handler: function (event) {
      console.warn('SpeechRecognition API error', event.error, event.message);

      updateNodeText('status-last-error', event.error);
      updateNodeText('status-last-error-message', event.message);
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
          updateNodeText('status-last-error');
          updateNodeText('status-last-error-message');

          r.start.handler(event);
        },
      },
      end: {
        name: 'end',
        handler: function (event) {
          r.end.handler(event);

          // reset speech API and get back in there.
          // there ought to be some error checking and somesuch, but in general the
          // intent for this project is to be used in OBS to add closed captions,
          // which means we should handle disconnects as gracefully as is reasonably
          // possible.
          //
          // future versions will require flags and proper configurations and the like.
          window.setTimeout(function () {
            if (!r.status()) {
              // setupCaptions(recognition);
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
