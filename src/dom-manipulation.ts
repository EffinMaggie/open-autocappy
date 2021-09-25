/** @format */

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

export function updateNodeText(nodeID: string, newText?: string): HTMLElement | false {
  var n = document.getElementById(nodeID);
  if (n) {
    return updateText(n, newText);
  }

  return false;
}

type classList = Set<string> | Array<string> | false;

export function updateClasses(node: HTMLElement, remove: string[] = [], add: string[] = []): HTMLElement {
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

export function updateNodeClasses(nodeID: string, remove: string[], add: string[]): HTMLElement | void {
  let node = document.getElementById(nodeID);
  if (node) {
    return updateClasses(node, remove, add);
  }
}
