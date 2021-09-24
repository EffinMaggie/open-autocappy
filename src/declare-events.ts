/** @format */

import { updateNodeClasses } from './dom-manipulation.js';
import { DateBetween, now } from './dated.js';

type EventHandler = (event: Event) => void;

export interface EventDeclaration {
  name: string;
  handler: EventHandler;
}

const endcls = new Set(['end']);
const activecls = new Set(['active']);

export function makeStatusHandlers(id: string, onstart: string, onend: string) {
  let active = false;
  let started = null;

  return {
    status: function () {
      return active;
    },

    start: {
      name: onstart,
      handler: function (event) {
        active = true;
        started = now();

        updateNodeClasses(id, endcls, activecls);
      },
    },

    end: {
      name: onend,
      handler: function (event) {
        active = false;
        started = null;

        updateNodeClasses(id, activecls, endcls);
      },
    },
  };
}

export function registerEventHandlers(emitter: EventTarget, events) {
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
