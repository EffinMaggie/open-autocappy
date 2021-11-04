/** @format */

import { ONodeUpdater, updateClasses } from './dom-manipulation.js';
import { MDate, DateBetween, now } from './dated.js';

type EventHandler = (event: Event) => void;

export function makeStatusHandlers(
  observer: EventTarget,
  updater: ONodeUpdater,
  onstart: string,
  onend: string
) {
  let active: predicate = between(observer, onstart, onend);
  let started: number | undefined = undefined;

  let update = () => {
    if (active()) {
      updateClasses(updater, ['inactive', 'end'], ['active']);
    } else {
      updateClasses(updater, ['inactive', 'active'], ['end']);
    }
  };

  return {
    status: active,

    [onstart]: (event: Event) => {
      started = event.timeStamp;
      update();
    },

    [onend]: (event) => {
      started = undefined;
      update();
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

export type maybe = boolean | undefined;
export type handler = (event: Event) => void;
export type predicate = (event?: Event) => maybe;

/** event handling with extra constraints.
 *
 *  A wrapper around browser event handling that can automatically add and
 *  remove event handlers based on other events firing.
 */
export const on = (
  observer: EventTarget,
  upon: Iterable<string>,
  call: handler,
  when?: Iterable<string>,
  until?: Iterable<string>
): handler => {
  let registered = false;

  const listen = (add: boolean = true) => {
    if (add) {
      return observer.addEventListener.bind(observer);
    }

    return observer.removeEventListener.bind(observer);
  };

  const setWhen = (add: boolean = true) => {
    if (when) {
      for (const w of when) {
        listen(add)(w, adder);
      }
    }
  };

  const adder = () => {
    if (registered) {
      return;
    }

    for (const condition of upon) {
      listen()(condition, call);

      setWhen(false);

      if (until) {
        const setUntil = (add: boolean = true) => {
          for (const u of until) {
            listen(add)(u, cleaner);
          }
        };

        const cleaner = () => {
          listen(false)(condition, call);
          setUntil(false);
          setWhen();
          registered = false;
        };

        setUntil();
      }
    }

    registered = true;
  };

  if (when) {
    setWhen();
  } else {
    adder();
  }

  return call;
};

export const poke = (observer: EventTarget, event: string | CustomEvent, relay?: Event) => {
  if (typeof event === 'string') {
    return observer.dispatchEvent(new CustomEvent(event, { detail: relay }));
  }

  return observer.dispatchEvent(event);
};

export const bookend = (
  call: handler,
  name: string = call.name,
  detail?: any,
  observer?: EventTarget
): handler => {
  const starting: string = `${name}...`;
  const done: string = `${name}!`;
  const fn = {
    [name]: (event: Event) => {
      const target: EventTarget | null = observer ?? event?.target ?? null;
      const relay = detail ?? event ?? undefined;
      const options = {
        detail: relay,
      };
      const startingCE: CustomEvent = new CustomEvent(starting, options);
      const doneCE: CustomEvent = new CustomEvent(done, options);
      const method = call.bind(target);

      if (target) {
        poke(target, startingCE);
        method(event);
        poke(target, doneCE);
      } else {
        method(event);
      }
    },
  };

  return fn[name].bind(observer);
};

export const must = (
  call: handler,
  terms: Iterable<predicate>,
  name: string = call.name,
  detail?: any,
  observer?: EventTarget
): handler => {
  const fail: string = `!${name}`;

  const fn = {
    [name]: (event: Event) => {
      const target: EventTarget | null = observer ?? event?.target ?? null;
      const relay = detail ?? event ?? undefined;
      const options = {
        detail: relay,
      };
      const failCE: CustomEvent = new CustomEvent(fail, options);

      for (const condition of terms) {
        const pass = condition.bind(target);

        if (!pass(event)) {
          if (target) {
            poke(target, failCE);
          }
          return;
        }
      }

      call.bind(target)(event);
    },
  };

  return fn[name].bind(observer);
};

export const between = (
  observer: EventTarget,
  after: string,
  before: string,
  value: boolean = true,
  now?: boolean
): predicate => {
  let state: maybe = now;

  const fn = {
    between: (): maybe => {
      return state;
    },
    [after]: () => {
      state = true;
    },
    [before]: () => {
      state = false;
    },
  };

  on(observer, [after], fn[after]);
  on(observer, [before], fn[before]);

  return fn.between;
};
