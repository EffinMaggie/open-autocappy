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
  SpeechAPI,
  SpeechAPIEvent,
  SpeechAPIResultList,
  SpeechAPIResult,
  SpeechAPIAlternative,
} from './caption-branches.js';

var recogniser = null;
if ('webkitSpeechRecognition' in window) {
  recogniser = window['webkitSpeechRecognition'];
}
if ('SpeechRecognition' in window) {
  recogniser = window['SpeechRecognition'];
}
var recognition = new recogniser();

recognition.continuous = true;
recognition.lang = 'en';
recognition.interimResults = true;
recognition.maxAlternatives = 5;

// TODO: allow for user settings instead of hardcoded defaults
// TODO: allow users to turn captions on and off
var setupCaptions = function (recognition) {
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

registerEventHandlers(recognition, {
  result: {
    name: 'result',
    handler: (event: SpeechAPIEvent) => {
      // FIX: handle disappearing nodes properly
      // TODO: create separate type for qualified output sets
      if (!event || !event.results) {
        // nothing to do
        return;
      }

      var caption = document.getElementById('caption');
      var transcript = document.getElementById('transcript');

      while (!caption.children || caption.children.length < event.results.length) {
        var li = document.createElement('li');
        updateClasses(li, new Set(), new Set(['speculative']));

        caption.appendChild(li);
      }
      while (caption.children.length > event.results.length) {
        caption.removeChild(caption.children[0]);
      }

      for (var r = 0; r < event.results.length; r++) {
        var result: SpeechAPIResult = event.results[r];
        var oli = caption.children[r];

        let bs = SpeechAPI.fromResult(result, r);
        let li = DOM.toLi(bs);

        /**
         * isFinal doesn't mean it can't still be multiple choices,
         * but it does mean that there won't be future updates to
         * this result, if we're holding the event the right way up,
         * that is to say, start at event.resultIndex.
         */
        if (result.isFinal) {
          transcript.appendChild(li);
          updateNodeText('last-final', bs.end().caption);
        } else {
          /**
           * if 'final' isn't set on the result, this is an interim
           * result, which may (or not) replace any previous content
           * as speech is recognised and understood by the API.
           * These results MAY disappear at a later stage, from the
           * end of event.results, which should also be the 'lowest'
           * level if there's more than one result that is not final.
           *
           * OK, this isn't Best Explanation. The idea is, that
           * several results may be worked on at the same time, and
           * the index number is about the only thing we have to go
           * on, for UI purposes. Chrome seems to use a layout much
           * like this:
           *
           * event.results: [prior finals...] [finals...] [interims...]
           *
           * Sorting by the array index naturally provides a sorting
           * such that 'old stuff' is first, and 'new stuff' settles
           * in later, naturally.
           *
           * The tricky part is that the docs aren't clear about if
           * 'settled' results can 'disappear' entirely, so e.g.
           * Edge keeps all results pretty much until you stop the
           * recognition entirely, while Chrome won't be repeating
           * itself about anything that settled. That's where
           * resultIndex comes in: the browser should set this only
           * to the later, 'unsettled' things that need updating.
           */
          caption.replaceChild(li, oli);
        }

        updateNodeText('last-line', bs.end().caption);
      }
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
          updateNodeText('status-last-error', null);
          updateNodeText('status-last-error-message', null);

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
              setupCaptions(recognition);
            }
          }, 5000);
        },
      },
      status: r.status,
    };
  })()
);

window.addEventListener('load', function (event) {
  setupCaptions(recognition);
});
