var SpeechRecognition = SpeechRecognition || webkitSpeechRecognition;
var recognition = new SpeechRecognition();

recognition.continuous = true;
recognition.lang = 'en-IE';
recognition.interimResults = true;
recognition.maxAlternatives = 20;

recognition.onstart = function() {
  var n = document.getElementById('status-captioning');
  if (n) {
    n.setAttribute('class', 'active');
  }

  n = document.getElementById('status-service');
  if (n) {
    n.setAttribute('class', 'active');
  }
  n.textContent = recognition.serviceURI;
};

recognition.onaudiostart = function() {
  var n = document.getElementById('status-audio');
  if (n) {
    n.setAttribute('class', 'active');
  }
};

recognition.onsoundstart = function() {
  var n = document.getElementById('status-sound');
  if (n) {
    n.setAttribute('class', 'active');
  }
};

recognition.onspeechstart = function() {
  var n = document.getElementById('status-speech');
  if (n) {
    n.setAttribute('class', 'active');
  }
};

recognition.onresult = function(event) {
  if (!event || !event.results) {
    // nothing to do
  } else {
    var caption = document.getElementById('caption');

    while (!caption.childNodes || (caption.childNodes.length < event.results.length)) {
      var li = document.createElement('li');
      li.setAttribute('class', 'speculative');

      caption.appendChild(li);
    }

    while (caption.childNodes.length > event.results.length) {
      caption.removeChild(caption.childNodes[0]);
    }

    for (var r = 0; r < event.results.length; r++) {
      var result = event.results[r];

      var li = document.createElement('li');
      if (result.isFinal) {
        li.setAttribute('class', 'final');
      }

      var interim = [];
      var oli = caption.childNodes[r];

      if (oli && oli.childNodes) {
        for (var c = 0; c < oli.childNodes.length; c++) {
          var cn = oli.childNodes[c];
          var te = cn.textContent;
          var addOK = true;

          // remove noisy extra whitespace
          te = te.replace(/ +(?= )/g, '');

          if (cn.getAttribute('class') == 'interim') {
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
        si.setAttribute('class', 'interim');
        si.appendChild(tn);
        li.appendChild(si);
      }

      for (var a = 0; a < result.length; a++) {
        var alternative = result[a];

        var transcript = alternative.transcript;
        var confidence = alternative.confidence;

        var tn = document.createTextNode(transcript);
        var e = document.createElement('span');

        e.setAttribute('data-confidence', confidence);

        if (!result.isFinal) {
          if (interim.includes(transcript)) {
            continue;
          }

          interim.push(transcript);
          e.setAttribute('class', 'interim');
        }
        e.appendChild(tn);

        li.appendChild(e);

        var sic = transcript;

        if (!result.isFinal) {
          sic = '[ ' + transcript + ' ]';
        }

        var ll = document.getElementById('last-line');
        if (ll) {
          var t = document.createTextNode(sic);
          if (ll.childNodes && ll.childNodes[0]) {
            ll.replaceChild(t, ll.childNodes[0])
          } else {
            ll.appendChild(t);
          }
        }

        if (result.isFinal) {
          var lf = document.getElementById('last-final');
          if (lf) {
            var t = document.createTextNode(sic);
            if (lf.childNodes && lf.childNodes[0]) {
              lf.replaceChild(t, lf.childNodes[0])
            } else {
              lf.appendChild(t);
            }
          }
        }
      }
    }
  }
};

var setupCaptions = function() {
  var start = function(event) {
    try {
      recognition.start();
    } catch (e) {
      if (e.name == 'InvalidStateError') {
        // documentation says this is only thrown if speech recognition is on,
        // so ignore this problem.
      } else {
        throw e;
      }
    }
  }

  window.onfocus = start;

  start();
}

recognition.onend = function() {
  var n = document.getElementById('status-captioning');
  if (n) {
    n.setAttribute('class', 'speech-end');
  }
};

recognition.onaudioend = function() {
  var n = document.getElementById('status-audio');
  if (n) {
    n.setAttribute('class', 'audio-end');
  }
};

recognition.onsoundend = function() {
  var n = document.getElementById('status-sound');
  if (n) {
    n.setAttribute('class', 'sound-end');
  }
};

recognition.onspeechend = function() {
  var n = document.getElementById('status-speech');
  if (n) {
    n.setAttribute('class', 'speech-end');
  }

  // reset speech API and get back in there.
  // there ought to be some error checking and somesuch, but in general the
  // intent for this project is to be used in OBS to add closed captions,
  // which means we should handle disconnects as gracefully as is reasonably
  // possible.
  //
  // future versions will require flags and proper configurations and the like.

  window.setTimeout(function(){ setupCaptions(); }, 5000);

  setupCaptions();
};

window.addEventListener('load', (event) => {
  console.log('code loaded; autorunning speech recognition.');

  setupCaptions();
});