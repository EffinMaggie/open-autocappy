/** @format */

import { updateNodeClasses } from './dom-manipulation.js';
import { MDate, DateBetween, now } from './dated.js';

type EventHandler = (event: Event) => void;

export function makeStatusHandlers(id: string, onstart: string, onend: string) {
  let active = false;
  let started: number | undefined = undefined;

  return {
    status: () => active,

    [onstart]: (event: Event) => {
      active = true;
      started = event.timeStamp;

      updateNodeClasses(id, ['end'], ['active']);
    },

    [onend]: (event) => {
      active = false;
      started = undefined;

      updateNodeClasses(id, ['active'], ['end']);
    },
  };
}

export function registerEventHandlers(emitter: EventTarget, events): () => boolean {
  var status = () => false;

  for (const key in events) {
    const ev = events[key];

    if (key === 'status') {
      status = ev;
    } else {
      emitter.addEventListener(key, ev);
    }
  }

  return status;
}

export function unregisterEventHandlers(emitter: EventTarget, events): () => boolean {
  var status = () => false;

  for (const key in events) {
    const ev = events[key];

    if (key === 'status') {
      status = ev;
    } else {
      emitter.removeEventListener(key, ev);
    }
  }

  return status;
}

// REFACTOR: make events composable and declarative
// TODO: add sanity checking for event states
