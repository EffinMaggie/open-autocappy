/** @format */

import { MutableValue, ToString, FromString } from './qualified.js';

const defaultStringValue: string = '[default value]';

type valueSet = Set<string | undefined>;

const superfluousValue: valueSet = new Set([undefined, '']);

function attributeText(attribute: string, coalesce: string, element: HTMLElement): string {
  return element.getAttribute(attribute) || coalesce;
}

function elementText(coalesce: string, element: HTMLElement): string {
  if (!element.innerText) {
    return coalesce;
  }

  return element.innerText;
}

const withAttributeText = async (attribute: string, coalesce: string, element: HTMLElement) =>
  attributeText(attribute, coalesce, element);

const withElementText = async (coalesce: string, element: HTMLElement) =>
  elementText(coalesce, element);

const attributeChange = (
  attribute: string,
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value?: string
): Promise<boolean> => {
  return withAttributeText(attribute, coalesce, element).then((currentValue: string) => {
    const wantValue: string = value ?? coalesce;

    if (superfluous.has(value)) {
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
        return true;
      }

      return false;
    }

    if (currentValue != wantValue) {
      element.setAttribute(attribute, wantValue);
      return true;
    }

    return false;
  });
};

const elementChange = (
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value?: string
): Promise<boolean> => {
  return withElementText(coalesce, element).then((currentValue: string) => {
    const wantValue: string = value ?? coalesce;

    if (superfluous.has(wantValue)) {
      if (currentValue !== '') {
        element.innerText = '';
        return true;
      }

      return false;
    }

    if (wantValue === currentValue) {
      return false;
    }

    element.innerText = wantValue;
    return true;
  });
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

  change(node: HTMLElement, nv?: string) {
    if (this.attribute) {
      return attributeChange(this.attribute, superfluousValue, this.coalesce, node, nv);
    }

    return elementChange(superfluousValue, this.coalesce, node, nv);
  }

  get value(): string {
    for (let node of this.nodes) {
      const nv = this.text(node);

      if (nv !== undefined) {
        return nv;
      }
    }
    return this.coalesce;
  }

  set value(to: string) {
    for (const node of this.nodes) {
      this.change(node, to);
    }
  }

  get string() {
    return this.value;
  }

  set string(value: string) {
    this.value = value;
  }

  constructor(
    private readonly attribute?: string,
    private readonly coalesce: string = '[default value]'
  ) {
    super();
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
  }
}

export class ONodeQueryUpdater extends ONodeUpdater {
  get nodes(): Iterable<HTMLElement> {
    if (this.query) {
      return document.querySelectorAll(this.query);
    }

    return [];
  }

  constructor(protected readonly query: string, attribute?: string, coalesce?: string) {
    super(attribute, coalesce);
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
    get number(): number {
      return Number(this.updater.value);
    }

    set number(value: number) {
      this.updater.value = value.toString();
    }
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

      for (const cls of add) {
        s.add(cls);
      }

      for (const cls of remove) {
        s.delete(cls);
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
