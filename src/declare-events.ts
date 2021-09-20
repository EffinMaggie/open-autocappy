import { updateNodeClasses } from './dom-manipulation.js';

export interface eventHandler {
  name: string;
  handler: (event: object) => void;
}

export function makeStatusHandlers(id: string, onstart: string, onend: string) {
  var active = false;

  return {
    status: function () {
      return active;
    },

    start: {
      name: onstart,
      handler: function (event) {
        active = true;

        updateNodeClasses(id, ['end'], ['active']);
      }
    },

    end: {
      name: onend,
      handler: function (event) {
        active = false;

        updateNodeClasses(id, ['active'], ['end']);
      }
    }
  }
}

export function registerEventHandlers(emitter, events) {
  var status = undefined;

  for (const key in events) {
    const ev = events[key];

    if (key === 'status') {
      status = ev;
    } else {
      emitter.addEventListener(ev.name, ev.handler);
    }
  }

  return status;
}

// REFACTOR: make events composable and declarative
// TODO: add sanity checking for event states