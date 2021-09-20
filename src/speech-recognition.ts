import { clearContent, addContent, replaceContent, updateNodeText, updateClasses, hasClass } from './dom-manipulation.js';
import { makeStatusHandlers, registerEventHandlers } from './declare-events.js';

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
// TODO: allow turning users to turn captions on and off
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
}

// REFACTOR: make event handlers declarative
export var isAudioActive =
  registerEventHandlers(
    recognition,
    makeStatusHandlers(
      'status-audio', 'audiostart', 'audioend'));

export var isSoundActive =
  registerEventHandlers(
    recognition,
    makeStatusHandlers(
      'status-sound', 'soundstart', 'soundend'));

export var isSpeechActive =
  registerEventHandlers(
    recognition,
    makeStatusHandlers(
      'status-speech', 'speechstart', 'speechend'));

registerEventHandlers(
  recognition, {
  'result': {
    name: 'result',
    handler: function (event) {
      // FIX: handle disappearing nodes properly
      // TODO: create separate type for qualified output sets
      if (!event || !event.results) {
        // nothing to do
      } else {
        var caption = document.getElementById('caption');
        while (!caption.children || (caption.children.length < event.results.length)) {
          var li = document.createElement('li');
          li = updateClasses(li, [], ['speculative']);

          caption.appendChild(li);
        }
        while (caption.children.length > event.results.length) {
          caption.removeChild(caption.children[0]);
        }

        for (var r = 0; r < event.results.length; r++) {
          var result = event.results[r];

          var li = document.createElement('li');
          if (result.isFinal) {
            li = updateClasses(li, [], ['final']);
          }

          var interim = [];
          var oli = caption.children[r];

          if (oli && oli.children) {
            for (var c = 0; c < oli.children.length; c++) {
              var cn = oli.children[c];
              var te = cn.textContent;
              var addOK = true;

              // remove noisy extra whitespace
              te = te.replace(/ +(?= )/g, '');

              // TODO: create a dedicated prefix-free list data structure
              if (hasClass(cn, 'interim')) {
                // remove all prefixes
                // note: in future version, log the timing of when the transcript
                // was recorded, and the confidence level
                for (var d = 0; d < interim.length; d++) {
                  if (te.startsWith(interim[d])) {
                    // found an element that is a prefix of what we add here, so
                    // remove the prefix.
                    interim.splice(d, 1);
                    d--;
                  } else if (interim[d].startsWith(te)) {
                    // reverse: what we're trying to add already exists in the list
                    // and the new string we want to add is a prefix of a longer
                    // version in the list: skip adding right away.
                    addOK = false;
                    break;
                  }
                }

                // add any new and unique alternative we don't have yet
                if (addOK && !interim.includes(te)) {
                  interim.push(te);
                }
              }
            }
          }

          caption.replaceChild(li, oli);

          for (var c = 0; c < interim.length; c++) {
            var tn = document.createTextNode(interim[c]);
            var si = document.createElement('span');
            si = updateClasses(si, [], ['interim']);
            si.appendChild(tn);
            li.appendChild(si);
          }

          for (var a = 0; a < result.length; a++) {
            var alternative = result[a];

            var transcript = alternative.transcript;
            var confidence = alternative.confidence;

            var tn = document.createTextNode(transcript);
            var e = document.createElement('span');

            if (confidence && confidence > 0) {
              e.setAttribute('data-confidence', confidence);
            }

            if (!result.isFinal) {
              if (interim.includes(transcript)) {
                continue;
              }

              interim.push(transcript);
              e = updateClasses(e, [], ['interim']);
            }
            e.appendChild(tn);
            li.appendChild(e);

            if (result.isFinal) {
              updateNodeText('last-line', transcript);
              updateNodeText('last-final', transcript);
            } else {
              updateNodeText('last-line', '[ ' + transcript + ' ]');
            }
          }
        }
      }
    }
  },

  'error': {
    name: 'error',
    handler: function(event) {
      console.warn('SpeechRecognition API error', event.error, event.message);

      updateNodeText('status-last-error', event.error);
      updateNodeText('status-last-error-message', event.message);
    }
  },

  'nomatch': {
    name: 'nomatch',
    handler: function(event) {
      console.warn('SpeechRecognition API nomatch event', event);
    }
  }
});

export var isCaptioning =
  registerEventHandlers(
    recognition,
    function () {
    var r = makeStatusHandlers(
        'status-captioning', 'start', 'end');

    return {
      start: {
        name: 'start',
        handler: function (event) {
          updateNodeText('status-last-error', null);
          updateNodeText('status-last-error-message', null);

          r.start.handler(event);
        }
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
          window.setTimeout(
            function () {
            if (!r.status()) {
              setupCaptions(recognition);
            }
          },
            5000);
        }
      },
      status: r.status
    }
  }
    ());

window.addEventListener(
  'load',
  function (event) {
  setupCaptions(recognition);
});
