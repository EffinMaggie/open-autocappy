/** @format */

import { MutableValue, ToString, FromString } from './qualified.js';
import { action, actions, listeners, poke } from './declare-events.js';

const defaultStringValue: string = '[default value]';

type valueSet = Set<string | undefined>;

const superfluousValue: valueSet = new Set([undefined, '']);

function attributeText(attribute: string, coalesce: string, element: HTMLElement): string {
  return element.getAttribute(attribute) || coalesce;
}

function elementText(coalesce: string, element: HTMLElement): string {
  if (!element.innerText || element.innerText == '') {
    return coalesce;
  }

  return element.innerText;
}

const attributeChange = (
  attribute: string,
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value: string,
  cachedValue?: string
): void => {
  const currentValue: string = cachedValue ?? attributeText(attribute, coalesce, element);
  const wantValue: string = value || coalesce;

  if (superfluous.has(wantValue) || wantValue == coalesce) {
    if (element.hasAttribute(attribute)) {
      element.removeAttribute(attribute);
    }
  } else if (currentValue != wantValue) {
    element.setAttribute(attribute, wantValue);
  }
};

const elementChange = (
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value: string,
  cachedValue?: string
): void => {
  const currentValue: string = cachedValue ?? elementText(coalesce, element);
  const wantValue: string = value || coalesce;

  if (superfluous.has(wantValue) || wantValue === coalesce) {
    if (currentValue !== '') {
      element.innerText = '';
    }
  } else if (currentValue != wantValue) {
    element.innerText = wantValue;
  }
};

export class ONodeUpdater extends EventTarget implements MutableValue<string>, FromString {
  valueOf(): string {
    return this.value;
  }

  toString(): string {
    return this.string;
  }

  get nodes(): Iterable<HTMLElement> {
    return [];
  }

  text(node: HTMLElement): string {
    if (this.attribute) {
      return attributeText(this.attribute, this.coalesce, node);
    }

    return elementText(this.coalesce, node);
  }

  change(node: HTMLElement, nv: string) {
    const value = nv.trim();

    if (this.attribute) {
      attributeChange(this.attribute, this.superfluous, this.coalesce, node, value, this.cachedValue);
    } else {
      elementChange(this.superfluous, this.coalesce, node, value, this.cachedValue);
    }
  }

  get value(): string {
    if (this.cachedValue !== undefined) {
      return this.cachedValue;
    }

    for (let node of this.nodes) {
      const nv = this.text(node);

      if (nv !== undefined) {
        this.cachedValue = nv;
        return nv;
      }
    }

    this.cachedValue = this.coalesce;
    return this.coalesce;
  }

  set value(to: string) {
    for (const node of this.nodes) {
      this.change(node, to);
    }

    this.cachedValue = to;
  }

  get string() {
    return this.value;
  }

  set string(value: string) {
    this.value = value;
  }

  protected superfluous: valueSet;

  protected lastConfirmedCacheStatus?: boolean;
  protected lastConfirmedValue?: string;

  protected get cacheEnabled(): boolean {
    return this.lastConfirmedCacheStatus ?? false;
  }

  protected set cacheEnabled(value: boolean) {
    if (this.cacheEnabled !== value) {
      this.lastConfirmedCacheStatus = value;
      if (value) {
        const mutationOpts = this.attribute
          ? {
              attributeFilter: [this.attribute],
            }
          : {
              characterData: true,
            };

        for (const node of this.nodes) {
          this.observer.observe(node, mutationOpts);
        }
      } else {
        this.lastConfirmedCacheStatus = false;
        this.observer.disconnect();
        this.cachedValue = undefined;
      }
    }
  }

  protected get cachedValue(): string | undefined {
    if (!this.cacheEnabled) {
      return undefined;
    }

    return this.lastConfirmedValue;
  }

  protected set cachedValue(value: string | undefined) {
    if (value === undefined) {
      this.lastConfirmedValue = undefined;
    } else if (this.cacheEnabled) {
      if (this.lastConfirmedValue !== value) {
        this.lastConfirmedValue = value;
        poke(this, 'value-change-observed');
      }
    }
  }

  syncCache = () => {
    this.cachedValue = undefined;
    this.cachedValue = this.value;
  };

  protected observer: MutationObserver = new MutationObserver(
    // don't try to be smart here, instead make sure to be very selective
    // during registration.
    this.syncCache
  );

  constructor(
    private readonly attribute?: string,
    private readonly coalesce: string = '[default value]'
  ) {
    super();
    this.superfluous = superfluousValue;
  }
}

export class OExplicitNodeUpdater extends ONodeUpdater {
  get nodes(): Iterable<HTMLElement> {
    if (this.node) {
      return [this.node];
    }

    return [];
  }

  constructor(private readonly node: HTMLElement, attribute?: string, coalesce?: string) {
    super(attribute, coalesce);
    this.cacheEnabled = true;
  }
}

export class ONodeQueryUpdater extends ONodeUpdater {
  get nodes(): Iterable<HTMLElement> {
    return document.querySelectorAll(this.query);
  }

  constructor(protected readonly query: string, attribute?: string, coalesce?: string) {
    super(attribute, coalesce);
    this.cacheEnabled = true;
  }
}

export namespace Access {
  export class FromNode {
    constructor(protected readonly updater: ONodeUpdater) {}
  }

  export class Storage extends FromNode {
    get string(): string {
      return this.updater.value;
    }

    set string(value: string) {
      this.updater.value = value;
    }
  }

  export class Boolean extends FromNode {
    get boolean(): boolean {
      return this.updater.value === 'true';
    }

    set boolean(value: boolean) {
      this.updater.value = value ? 'true' : 'false';
    }
  }

  export class Numeric extends FromNode {
    observedValue?: number;

    get number(): number {
      if (this.observedValue !== undefined) {
        return this.observedValue;
      }

      return Number(this.updater.value);
    }

    set number(value: number) {
      this.updater.value = value.toString();

      if (this.observedValue !== undefined) {
        this.observedValue = value;
      }
    }

    cache = () => {
      this.observedValue = undefined;
      this.observedValue = Number(this.updater.value);
    };

    private readonly weave = new listeners(
      [this.updater],
      new actions([action.make(this.cache, 'cache-value').upon(['value-change-observed'])])
    );

    private readonly enabled = (this.weave.on = true);
  }

  export class Classes extends FromNode {
    get classes(): Iterable<string> {
      return this.updater.value.split(' ') || [];
    }

    set classes(value: Iterable<string>) {
      this.updater.value = Array.from(value).join(' ');
    }

    modify(remove: Iterable<string> = [], add: Iterable<string> = []) {
      const attr = this.classes;

      let s = new Set(attr);
      s.delete('');

      for (const cls of remove) {
        s.delete(cls);
      }

      for (const cls of add) {
        s.add(cls);
      }

      this.classes = s;
    }

    has(cls: string) {
      for (const cl of this.classes) {
        if (cl === cls) {
          return true;
        }
      }

      return false;
    }
  }
}
