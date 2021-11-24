/** @format */

import { ONodeUpdater, Access } from './dom-manipulation.js';
import { MDate, DateBetween, now } from './dated.js';

type maybe = boolean | undefined;
type thunk<Type> = () => Type;
type filter<Type> = (on: Type) => Type;

type observers = Iterable<EventTarget>;

export class action {
  public readonly triggers: Set<string>;

  constructor(
    public readonly handler: EventListener,
    public readonly name: string = action.name,
    triggers: Iterable<string> = []
  ) {
    this.triggers = new Set<string>(triggers);
  }

  public static make = (handler: EventListener, name: string = handler.name) => {
    const fn = {
      [name]: (event: Event) => handler(event),
    };

    return new action(fn[name], name);
  };

  public upon = (triggers: Iterable<string>): action => new action(this.handler, this.name, triggers);
}

export class actions implements Iterable<action> {
  protected readonly mine: Array<action>;

  *[Symbol.iterator](): Generator<action> {
    for (const m of this.mine) {
      yield m;
    }
  }

  constructor(protected readonly actions: Iterable<action>) {
    this.mine = Array.from(actions);
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
          this.observer.addEventListener(trigger, this.action.handler);
        } else {
          this.observer.removeEventListener(trigger, this.action.handler);
        }
      }
    }
  }
}

export class listeners implements Iterable<listener> {
  *[Symbol.iterator](): Generator<listener> {
    for (const observer of this.observers) {
      for (const action of this.actions) {
        yield new listener(observer, action);
      }
    }
  }

  constructor(protected readonly observers: observers, protected readonly actions: actions) {}

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
}

export class predicate extends EventTarget {
  cached: maybe = undefined;

  constructor(protected test: thunk<maybe>) {
    super();
  }

  protected assumedValue: maybe = undefined;
  protected static changedEvent = new CustomEvent('value-changed');
  protected static reentrancy: number = 0;

  public pass: thunk<maybe> = (): maybe => {
    const value = this.test();

    if (this.assumedValue !== undefined) {
      if (this.assumedValue === value) {
        this.assumedValue = undefined;
      } else {
        return this.assumedValue;
      }
    }

    if (value !== this.cached) {
      this.cached = value;
      predicate.reentrancy++;
      if (predicate.reentrancy === 1) {
        this.dispatchEvent(predicate.changedEvent);
      }
      predicate.reentrancy--;
    }

    return value;
  };

  public is = (v: maybe) => v === this.pass();

  public compliant = (expectation: boolean): boolean =>
    (expectation && this.pass()) || (!expectation && !this.pass());

  public ok: thunk<boolean> = () => this.is(true);
  public fail: thunk<boolean> = () => this.is(false) || this.is(undefined);

  /**
   * Override value, if different.
   *
   * Allows 'unsticking' predicates that may not be able to express their
   * condition perfectly, or to allow overrides during troubleshooting -
   * by a human, or otherwise.
   *
   * Note: the predicate will only assume a value that it doesn't have,
   * and the next time the predicate finds the assumed value matches the
   * tested value, it reverts automatically to normal behavior, discarding
   * the assumption.
   *
   * @emits 'value-changed' if the assumed value is set.
   */
  public set assume(value: maybe) {
    if (this.test() !== value) {
      this.assumedValue = value;
      predicate.reentrancy++;
      if (predicate.reentrancy === 1) {
        this.dispatchEvent(predicate.changedEvent);
      }
      predicate.reentrancy--;
    }
  }
}

export class tracker extends predicate {
  private value: maybe = undefined;
  protected static changedEvent = new CustomEvent('value-changed');

  constructor(
    public readonly observer: EventTarget,
    public readonly after: Iterable<string>,
    public readonly before: Iterable<string>
  ) {
    super(() => this.value);
  }

  private readonly weave = new listeners(
    [this.observer],
    new actions([
      new action(
        () => {
          if (!this.value) {
            this.value = true;
            this.dispatchEvent(tracker.changedEvent);
          }
        },
        'value-changed',
        this.after
      ),
      new action(
        () => {
          if (this.value) {
            this.value = false;
            this.dispatchEvent(tracker.changedEvent);
          }
        },
        'value-changed',
        this.before
      ),
    ])
  );

  private readonly enabled = (this.weave.on = true);
}
