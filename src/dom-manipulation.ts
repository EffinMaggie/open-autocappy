/** @format */

import {
  ValueBoilerplate,
  Observer,
  Observant,
  ToString,
  FromString,
  onValueWasSet,
  onValueHasChanged,
  defaultValue,
} from './qualified.js';

const nodeSymbol = Symbol('node');
const nodeID = Symbol('node-id');
const nodeQuery = Symbol('node-query');
const nodeAttribute = Symbol('node-attribute');

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

function attributeChange(
  attribute: string,
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value?: string
): boolean {
  const currentValue: string = attributeText(attribute, coalesce, element);

  if (superfluous.has(value)) {
    element.removeAttribute(attribute);
    return true;
  }

  const wantValue: string = value ?? coalesce;

  if (currentValue != wantValue) {
    element.setAttribute(attribute, wantValue);
    return true;
  }

  return false;
}

function elementChange(
  superfluous: valueSet,
  coalesce: string,
  element: HTMLElement,
  value?: string
): boolean {
  const currentValue: string = elementText(coalesce, element);
  const wantValue: string = value ?? coalesce;

  if (superfluous.has(value)) {
    if (element.innerText != '') {
      element.innerText = '';
      return false;
    }

    return false;
  } else if (wantValue === currentValue) {
    return false;
  } else if (element.innerText != wantValue) {
    element.innerText = wantValue;
    return true;
  }

  return false;
}

export class ONodeUpdater extends ValueBoilerplate<string> implements Observant<string>, FromString {
  [onValueWasSet]?: Observer<string>;
  [onValueHasChanged]?: Observer<string>;

  private readonly [nodeAttribute]?: string;
  private readonly [defaultValue]: string;

  get nodes(): Iterable<HTMLElement> {
    return [];
  }

  text(node: HTMLElement): string {
    const attr = this[nodeAttribute];
    const coalesce = this[defaultValue];

    if (attr) {
      return attributeText(attr, coalesce, node);
    }

    return elementText(coalesce, node);
  }

  change(node: HTMLElement, nv?: string): boolean {
    const attr = this[nodeAttribute];
    const coalesce = this[defaultValue];

    if (attr) {
      return attributeChange(attr, superfluousValue, coalesce, node, nv);
    }

    return elementChange(superfluousValue, coalesce, node, nv);
  }

  get value(): string {
    const onHasChanged = this[onValueHasChanged];
    let rv: string | undefined = undefined;
    for (let node of this.nodes) {
      const nv = this.text(node);

      if (nv !== rv) {
        if (rv !== undefined && onHasChanged) {
          onHasChanged(this, nv, rv ?? this[defaultValue]);
        }
        rv = nv;
      }
    }
    return rv ?? this[defaultValue];
  }

  set value(to: string) {
    const was = this.value;
    const onWasSet = this[onValueWasSet];
    const onHasChanged = this[onValueHasChanged];

    for (let node of this.nodes) {
      if (this.change(node, to) && onWasSet) {
        onWasSet(this, to, was);
      }
    }

    if (to !== was && onHasChanged) {
      onHasChanged(this, to, was);
    }
  }

  get string() {
    return this.value;
  }

  set string(s: string) {
    this.value = s;
  }

  constructor(attr?: string, coalesce: string = '[default value]') {
    super();

    this[nodeAttribute] = attr;
    this[defaultValue] = coalesce;
  }
}

export class OExplicitNodeUpdater extends ONodeUpdater {
  private [nodeSymbol]: HTMLElement;

  get nodes(): Iterable<HTMLElement> {
    const node = this[nodeSymbol];
    if (node) {
      return [node];
    }

    return [];
  }

  constructor(node: HTMLElement, attr?: string, coalesce?: string) {
    super(attr, coalesce);

    this[nodeSymbol] = node;
  }
}

export class ONodeQueryUpdater extends ONodeUpdater {
  private [nodeQuery]: string;

  get nodes(): Iterable<HTMLElement> {
    const q = this[nodeQuery];
    if (q) {
      return document.querySelectorAll(q);
    }

    return [];
  }

  constructor(query: string, attr?: string, coalesce?: string) {
    super(attr, coalesce);

    this[nodeQuery] = query;
  }
}

type classList = Set<string> | Array<string> | false;

export function updateClasses(
  updater: ONodeUpdater,
  remove: string[] = [],
  add: string[] = []
): string {
  const attr = updater.value.split(' ') || [];
  const classes = add.concat(attr);

  let s = new Set(classes);

  s.delete('');

  for (const cls of remove) {
    s.delete(cls);
  }

  const want = Array.from(s).join(' ');

  updater.value = want;
  return want;
}

export const hasClass = (updater: ONodeUpdater, cls: string): boolean =>
  updater.value.split(' ').includes(cls);
