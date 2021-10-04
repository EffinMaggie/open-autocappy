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
  return element.getAttribute(attribute) ?? coalesce;
}

function elementText(coalesce: string, element: HTMLElement): string {
  if (element.innerText == '') {
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

  console.log('text update: ', value, currentValue, wantValue);

  if (superfluous.has(value) || wantValue === coalesce || wantValue === currentValue) {
    if (element.innerText != '') {
      element.innerText = '';
      return false;
    }

    console.warn('no text update: ', value, currentValue, wantValue);
    return false;
  } else if (element.innerText != wantValue) {
    element.innerText = wantValue;
    return true;
  }

  console.warn('no text update: ', value, currentValue, wantValue);
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

export function clearContent(node: HTMLElement): HTMLElement {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  return node;
}

export function addContent(node: HTMLElement, newContent: Iterable<Node>): HTMLElement {
  for (const n of newContent) {
    node.appendChild(n);
  }

  return node;
}

export function replaceContent(node: HTMLElement, newContent: Iterable<Node>): HTMLElement {
  return addContent(clearContent(node), newContent);
}

export function updateText(node: HTMLElement, newText?: string): HTMLElement {
  return newText ? replaceContent(node, [document.createTextNode(newText)]) : clearContent(node);
}

type classList = Set<string> | Array<string> | false;

export function updateClasses(
  node: HTMLElement,
  remove: string[] = [],
  add: string[] = []
): HTMLElement {
  const had = node.hasAttribute('class');
  const attr = node.getAttribute('class');
  const classes = add.concat(attr?.split(' ') ?? []);

  let s = new Set(classes);

  for (const cls of remove) {
    s.delete(cls);
  }

  if (s.size > 0) {
    node.setAttribute('class', Array.from(s).join(' '));
  } else if (had) {
    node.removeAttribute('class');
  }

  return node;
}

export function hasClass(node: Element, cls: string): boolean {
  var c = node.getAttribute('class');
  if (!c) {
    return false;
  }

  return c.split(' ').includes(cls);
}

export function updateNodeClasses(
  nodeID: string,
  remove: string[],
  add: string[]
): HTMLElement | void {
  let node = document.getElementById(nodeID);
  if (node) {
    return updateClasses(node, remove, add);
  }
}
