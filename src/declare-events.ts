/** @format */

import { ONodeUpdater, Access } from './dom-manipulation.js';
import { MDate, DateBetween, now } from './dated.js';

type maybe = boolean | undefined;
type thunk<Type> = () => Type;
type filter<Type> = (on: Type) => Type;

type observers = Iterable<EventTarget>;

class action {
  constructor(
    protected readonly action: EventListener,
    public readonly name: string = action.name,
    triggers: Iterable<string> = [name],
    public readonly valid: predicate = predicate.yes,
    public readonly reentrant: predicate = predicate.yes,
    public readonly asynchronous: predicate = predicate.no
  ) {
    this.triggers = Array.from(triggers);
  }

  protected running: number = 0;

  public readonly triggers: Iterable<string>;

  protected process = (event: Event): boolean => {
    if (this.reentrant.fail() && this.running > 0) {
      return false;
    }

    this.running++;

    const valid = this.valid.ok();

    valid && this.action(event);

    this.running--;

    return valid;
  };

  protected asynchronously = async (event: Event): Promise<boolean> => this.process(event);

  public act = (event: Event): Promise<boolean> => {
    if (this.asynchronous.ok()) {
      return this.asynchronously(event);
    }

    return new Promise((resolve, reject) => resolve(this.process(event)));
  };

  public listener: (observer: EventTarget) => listener = (observer: EventTarget) =>
    new listener(observer, this);

  public *listeners(observers: observers): Generator<listener> {
    for (const observer of observers) {
      yield new listener(observer, this);
    }
  }
}

export class actions implements Iterable<action> {
  public static readonly none: actions = new actions();

  *[Symbol.iterator](): Generator<action> {}

  constructor(actions?: Iterable<action>) {
    if (actions === undefined) {
      return;
    }

    const mine = Array.from(actions);

    this[Symbol.iterator] = function* () {
      yield* mine;
    };
  }
}

class listener {
  protected added: boolean = false;

  constructor(public readonly observer: EventTarget, public readonly action: action) {}

  get on(): boolean {
    return this.added;
  }

  set on(want: boolean) {
    if (this.added !== want) {
      this.added = want;

      for (const trigger of this.action.triggers) {
        if (want) {
          this.observer.addEventListener(trigger, this.action.act);
        } else {
          this.observer.removeEventListener(trigger, this.action.act);
        }
      }
    }
  }
}

export class listeners implements Iterable<listener> {
  public static readonly none: listeners = new listeners([], actions.none);

  *[Symbol.iterator](): Generator<listener> {}

  constructor(
    protected readonly observers: observers,
    protected readonly actions: actions,
    auto: boolean = false
  ) {
    const mine: listener[] = Array.from(
      (function* () {
        for (const observer of observers) {
          for (const action of actions) {
            yield new listener(observer, action);
          }
        }
      })()
    );

    this[Symbol.iterator] = function* () {
      yield* mine;
    };

    if (auto) {
      this.on = auto;
    }
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

  gated(after: Iterable<string>, before: Iterable<string> = [], auto: boolean = true): listeners {
    return new listeners(
      this.observers,
      (function* (of: listeners) {
        yield* of.enablers(after, true);
        yield* of.enablers(after, false);
      })(this),
      auto
    );
  }
}

export class predicate extends EventTarget {
  static yes = new predicate(() => true);
  static no = new predicate(() => false);

  cached: maybe = undefined;

  constructor(
    public readonly test: thunk<maybe>,
    public readonly influencers: listeners = listeners.none
  ) {
    super();
  }

  public pass: thunk<maybe> = (): maybe => {
    const value = this.test();

    if (value !== this.cached) {
      this.cached = value;
      poke(this, 'value-changed');
    }

    return value;
  };

  public is = (v: maybe) => v === this.pass();

  public compliant = (expectation: boolean): boolean =>
    (expectation && this.pass()) || (!expectation && !this.pass());

  public ok: thunk<boolean> = () => this.is(true);
  public fail: thunk<boolean> = () => this.is(false) || this.is(undefined);
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
): listeners => {
  const actions = function* (): Generator<action> {
    yield new action(call, call.name, triggers);
  };

  let evs: listeners = new listeners([observer], actions(), false);
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

  observer.dispatchEvent.bind(observer)(new CustomEvent(event, { detail: relay }));
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
    public readonly name: string,
    public readonly after: Iterable<string>,
    public readonly before: Iterable<string>
  ) {
    super(
      () => this.value,
      new listeners(
        [observer],
        new actions([
          new action(
            () => {
              if (!this.value) {
                this.value = true;
                pake(this, 'value-changed');
              }
            },
            name,
            after
          ),
          new action(
            () => {
              if (this.value) {
                this.value = false;
                pake(this, 'value-changed');
              }
            },
            name,
            before
          ),
        ])
      )
    );

    this.influencers.on = true;
  }
}

export class syncPredicateStyle {
  private value: maybe = undefined;

  constructor(
    public readonly predicate: predicate,
    public readonly classes: Access.Classes,
    public readonly whenOn: Iterable<string> = new Set(['active']),
    public readonly whenOff: Iterable<string> = new Set(['end'])
  ) {}

  private readonly weave = [
    on(this.predicate, ['value-changed'], () => {
      if (this.predicate.ok()) {
        this.classes.modify(this.whenOff, this.whenOn);
      } else {
        this.classes.modify(this.whenOn, this.whenOff);
      }
    }),
  ];
}
