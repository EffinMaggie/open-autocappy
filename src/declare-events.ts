/** @format */

import { ONodeUpdater, updateClasses } from './dom-manipulation.js';
import { MDate, DateBetween, now } from './dated.js';

class action {
  constructor(public readonly action: EventListener, public readonly trigger: string = action.name) {}
}

class actor {
  protected added: boolean = false;

  constructor(public readonly observer: EventTarget, public readonly action: action) {}

  get on(): boolean {
    return this.added;
  }

  set on(want: boolean) {
    if (this.added !== want) {
      this.added = want;

      if (this.added) {
        this.observer.addEventListener(this.action.trigger, this.action.action);
      } else {
        this.observer.removeEventListener(this.action.trigger, this.action.action);
      }
    }
  }
}

type actions = Iterable<action>;
type observers = Iterable<EventTarget>;

export class actors implements Iterable<actor> {
  public static readonly none: actors = new actors([], []);

  *[Symbol.iterator](): Generator<actor> {}

  constructor(
    protected readonly observers: observers,
    protected readonly actions: actions,
    auto: boolean = false
  ) {
    const mine: actor[] = Array.from(
      (function* () {
        for (const observer of observers) {
          for (const action of actions) {
            yield new actor(observer, action);
          }
        }
      })()
    );

    this[Symbol.iterator] = function* () {
      yield* mine;
    };
  }

  get on(): boolean {
    for (const a of this) {
      if (!a.on) {
        return false;
      }
    }

    return true;
  }

  set on(want: boolean) {
    for (const a of this) {
      a.on = want;
    }
  }

  *enablers(triggers: Iterable<string>, want: boolean = true): Generator<action> {
    for (const trigger of triggers) {
      const fn = {
        [trigger]: () => {
          this.on = want;
        },
      };

      yield new action(fn[trigger], trigger);
    }
  }

  gated(after: Iterable<string>, before: Iterable<string> = [], auto: boolean = true): actors {
    return new actors(
      this.observers,
      (function* (of: actors) {
        yield* of.enablers(after, true);
        yield* of.enablers(after, false);
      })(this),
      auto
    );
  }
}

export type maybe = boolean | undefined;
export class predicate {
  constructor(public readonly pass: () => maybe, public readonly actors: actors) {}

  public compliant = (expectation: boolean): boolean =>
    (expectation && this.pass()) || (!expectation && !this.pass());
}

/** event handling with extra constraints.
 *
 *  A wrapper around browser event handling that can automatically add and
 *  remove event handlers based on other events firing.
 */
export const on = (
  observer: EventTarget,
  triggers: Iterable<string>,
  call: EventListener,
  when?: Iterable<string>,
  until?: Iterable<string>
): actors => {
  const actions = function* (): Generator<action> {
    for (const trigger of triggers) {
      yield new action(call, trigger);
    }
  };

  let evs: actors = new actors([observer], actions(), false);
  if (when) {
    evs = evs.gated(when, until, false);
  }

  evs.on = true;

  return evs;
};

function assertTarget(target?: EventTarget | null): asserts target {
  console.assert(target, 'All events must have a valid event.target');
}

function assertValidEvent(event?: string): asserts event {
  console.assert(event, 'Raised events must have a type name');
  console.assert(event !== '!', 'Raised events must have a valid name');
}

export const poke = (observer: EventTarget, event: string, relay?: any) => {
  assertValidEvent(event);

  return observer.dispatchEvent.bind(observer)(new CustomEvent(event, { detail: relay }));
};

export const pake = async (observer: EventTarget, event: string, relay?: any) =>
  poke(observer, event, relay);

export const bookend = (
  call: EventListener,
  name: string = call.name,
  detail?: any
): EventListener => {
  const starting: string = `${name}...`;
  const done: string = `${name}!`;
  const fn = {
    [name]: (event: CustomEvent<Event>) => {
      const target = event.target ?? event.detail?.target ?? this;

      assertTarget(target);

      const options = {
        detail: detail ?? event,
      };

      poke(target, starting, options.detail);
      call(event);
      pake(target, done, options.detail);
    },
  };

  return fn[name];
};

export const expect = (
  call: EventListener,
  terms: Iterable<predicate>,
  want: boolean = true,
  full: boolean = true,
  name: string = call.name,
  detail?: any
): EventListener => {
  assertValidEvent(name);

  const fail: string = `!${name}`;

  const fn = {
    [name]: (event: CustomEvent<Event>) => {
      const target = event.target ?? event.detail?.target ?? this;

      assertTarget(target);

      const options = {
        detail: detail ?? event,
      };

      let compliant: boolean = full;

      for (const condition of terms) {
        if (full) {
          compliant = compliant && condition.compliant(want);
        } else {
          compliant = compliant || condition.compliant(want);
        }

        if (full !== compliant) {
          break;
        }
      }

      if (compliant) {
        call(event);
      } else {
        pake(target, fail, options.detail);
      }
    },
  };

  return fn[name];
};

export class tracker extends predicate {
  private value: maybe = undefined;

  constructor(
    public readonly observer: EventTarget,
    public readonly after: string,
    public readonly before: string,
    public readonly updater?: ONodeUpdater
  ) {
    super(
      () => this.value,
      new actors(
        [observer],
        [
          new action(async () => {
            if (!this.value) {
              this.value = true;

              if (this.updater) {
                updateClasses(this.updater, ['inactive', 'end'], ['active']);
              }
            }
          }, after),
          new action(async () => {
            if (this.value) {
              this.value = false;

              if (this.updater) {
                updateClasses(this.updater, ['inactive', 'active'], ['end']);
              }
            }
          }, before),
        ]
      )
    );

    this.actors.on = true;
  }
}
