import { updateNodeClasses } from './dom-manipulation.js';

type EventHandler = (event: object) => boolean;

export interface EventDeclaration {
  name: string;
  handler: EventHandler;
}

export function makeStatusHandlers(id: string, onstart: string, onend: string) {
  var active = false;
  const endcls = new Set(['end']);
  const activecls = new Set(['active']);

  return {
    status: function () {
      return active;
    },

    start: {
      name: onstart,
      handler: function (event) {
        active = true;

        updateNodeClasses(id, endcls, activecls);
      }
    },

    end: {
      name: onend,
      handler: function (event) {
        active = false;

        updateNodeClasses(id, activecls, endcls);
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