/** @format */

import { Boilerplate, Observer, Observant, ToString, FromString, valueSetSymbol, valueChangedSymbol } from './qualified.js';

const nodeSymbol = Symbol('node');
const nodeIDSymbol = Symbol('node-id');
const nodeQuerySymbol = Symbol('node-query');
const nodeAttributeSymbol = Symbol('node-attribute');

export abstract class ONodeUpdater extends Boilerplate<string> implements Observant<string>, FromString {
  [valueSetSymbol]: Observer<string> = () => true;
  [valueChangedSymbol]: Observer<string> = () => true;

  private [nodeAttributeSymbol]?: string;

  abstract get nodes(): Iterable<HTMLElement>;

  text(node: HTMLElement, coalesce: string = ''): string {
    const attr = this[nodeAttributeSymbol];

    if (attr) {
      return node?.getAttribute(attr) ?? coalesce;
    }

    return node?.textContent ?? coalesce;
  }
  
  change(node: HTMLElement, nv?: string): void {
    const attr = this[nodeAttributeSymbol];

    if (attr) {
      if (nv) {
        node.setAttribute(attr, nv);
      } else {
        node.removeAttribute(attr);
      }
    } else if (node?.textContent) {
      node.textContent = nv ?? '';
    }
  }

  get value(): string {
    let rv: string[] = [];
    for (let node of this.nodes) {
      rv.push(this.text(node));
    }
    return rv.join(' ');
  }

  set value(val: string) {
    const og = this.value;
    const ogv = og.split(' ');

    for (let node of this.nodes) {
      const changed = this[valueSetSymbol](this, val, og);

      if (changed) {
        this.change(node, val);

        if (!this[valueChangedSymbol](this, val, og)) {
          this.change(node, og);
        }
      }
    }
  }

  get string() {
    return this.value;
  }

  set string(s: string) {
    this.value = s;
  }

  constructor(attr?: string) {
    super();
    this[nodeAttributeSymbol] = attr;
  }
}

export class OExplicitNodeUpdater extends ONodeUpdater {
  private [nodeSymbol]?: HTMLElement;

  get nodes(): Iterable<HTMLElement> {
    const node = this[nodeSymbol];
    if (node) {
      return [node];
    }

    return [];
  }

  constructor(node?: HTMLElement, attr?: string) {
    super(attr);
    this[nodeSymbol] = node;
  }
}

export class ONodeQueryUpdater extends ONodeUpdater {
  private [nodeQuerySymbol]?: string;

  get nodes(): Iterable<HTMLElement> {
    let q = this[nodeQuerySymbol];
    if (q) {
    return document.querySelectorAll(q);
    }

    return [];
  }

  constructor(query?: string, attr?: string) {
    super(attr);
    this[nodeQuerySymbol] = query;
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
