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
    protected readonly handler: EventListener,
    public readonly name: string = action.name,
    triggers: Iterable<string> = [],
    public readonly valid: predicate = predicate.yes,
    public readonly reentrant: predicate = predicate.yes,
    public readonly asynchronous: predicate = predicate.no
  ) {
    this.triggers = new Set<string>(triggers);
  }

  public static make = (handler: EventListener, name: string = handler.name) => {
    const fn = {
      [name]: (event: Event) => handler(event),
    };

    return new action(fn[name], name);
  };

  public static poke = (observer: EventTarget, event: string, relay?: any) =>
    action.make(() => poke(observer, event, relay), 'poke:' + event);

  public next = (act: action, name: string = this.name): action =>
    new action(
      (event: Event) => {
        this.handler(event);
        act.handler(event);
      },
      name,
      this.triggers,
      this.valid,
      this.reentrant,
      this.asynchronous
    );

  public prev = (act: action, name: string = this.name): action =>
    new action(
      (event: Event) => {
        act.handler(event);
        this.handler(event);
      },
      name,
      this.triggers,
      this.valid,
      this.reentrant,
      this.asynchronous
    );

  public renamed = (name: string): action =>
    new action(this.handler, name, this.triggers, this.valid, this.reentrant, this.asynchronous);

  public naming = (): action => this.upon([this.name]);
  public meshing = (): action => this.upon([this.name + '?']);

  public upon = (triggers: Iterable<string>): action =>
    new action(this.handler, this.name, triggers, this.valid, this.reentrant, this.asynchronous);

  public validp = (p: predicate): action =>
    new action(this.handler, this.name, this.triggers, p, this.reentrant, this.asynchronous);

  public reentrantp = (p: predicate): action =>
    new action(this.handler, this.name, this.triggers, this.valid, p, this.asynchronous);

  public asyncp = (p: predicate): action =>
    new action(this.handler, this.name, this.triggers, this.valid, this.reentrant, p);

  protected running: number = 0;

  protected process = (event: Event): boolean => {
    this.running++;

    let valid = true;

    valid = valid && (this.reentrant.ok() || this.running === 1);
    valid = valid && this.valid.ok();

    if (valid) {
      try {
        this.handler(event);
      } catch (e) {
        console.error(`exception during event processing: `, this, e);
        poke(event.target!, this.name + ':exception');
      }
    }

    this.running--;

    return valid;
  };

  protected asynchronously = async (event: Event): Promise<boolean> => this.process(event);

  public act = (event: Event) => {
    if (this.asynchronous.ok()) {
      this.asynchronously(event);
    } else {
      this.process(event);
    }
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

  public invert = () => new predicate(() => this.fail(), this.influencers);
  public also = (p: predicate) => new predicate(() => this.ok() && p.ok(), this.influencers);
  public or = (p: predicate) => new predicate(() => this.ok() || p.ok(), this.influencers);
  public nor = (p: predicate) => new predicate(() => this.fail() && p.fail(), this.influencers);
}

function assertTarget(target?: EventTarget | null): asserts target {
  console.assert(target, 'All events must have a valid event.target');
}

const badEventNames = new Set<string | undefined>([undefined, '', '!', '?', '...']);

function assertValidEvent(event?: string): asserts event {
  console.assert(event, 'Raised events must have a type name');
  console.assert(!badEventNames.has(event), 'Raised events must have a valid name');
}

export const poke = (observer: EventTarget, event: string, relay?: any) => {
  assertValidEvent(event);

  observer.dispatchEvent.bind(observer)(new CustomEvent(event, { detail: relay }));
};

export const pake = async (observer: EventTarget, event: string, relay?: any) =>
  poke(observer, event, relay);

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

  protected sync = () => {
    if (this.predicate.ok()) {
      this.classes.modify(this.whenOff, this.whenOn);
    } else {
      this.classes.modify(this.whenOn, this.whenOff);
    }
  };

  private readonly weave = new listeners(
    [this.predicate],
    new actions([action.make(this.sync, 'sync').upon(['value-changed'])])
  );
  private readonly enabled = (this.weave.on = true);
}
