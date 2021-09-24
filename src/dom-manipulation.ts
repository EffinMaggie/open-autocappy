/** @format */

export function clearContent(node: Element): Element {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  return node;
}

export function addContent(node: Element, newContent: Array<Node>): Element {
  for (const c in newContent) {
    node.appendChild(newContent[c]);
  }

  return node;
}

export function replaceContent(node: Element, newContent: Array<Node>): Element {
  return addContent(clearContent(node), newContent);
}

export function updateText(node: Element, newText: string): Element {
  return newText ? replaceContent(node, [document.createTextNode(newText)]) : clearContent(node);
}

export function updateNodeText(nodeID: string, newText: string): Element | false {
  var n = document.getElementById(nodeID);
  if (n) {
    return updateText(n, newText);
  }

  return false;
}

export function updateClasses(node: Element, remove: Set<string>, add: Set<string>): Element {
  var c = node.getAttribute('class');
  var s = new Set(c ? c.split(' ') : []);
  for (const i of remove) {
    s.delete(i);
  }
  for (const i of add) {
    s.add(i);
  }

  node.setAttribute('class', Array.from(s).join(' '));

  return node;
}

export function hasClass(node: Element, cls: string): boolean {
  var c = node.getAttribute('class');
  if (!c) {
    return false;
  }

  return c.split(' ').includes(cls);
}

export function updateNodeClasses(nodeID: string, remove: Set<string>, add: Set<string>): Element {
  return updateClasses(document.getElementById(nodeID), remove, add);
}
