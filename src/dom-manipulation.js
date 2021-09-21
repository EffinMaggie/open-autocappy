/** @format */

export function clearContent(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  return node;
}
export function addContent(node, newContent) {
  for (const c in newContent) {
    node.appendChild(newContent[c]);
  }
  return node;
}
export function replaceContent(node, newContent) {
  return addContent(clearContent(node), newContent);
}
export function updateNodeText(nodeID, newText) {
  var n = document.getElementById(nodeID);
  if (n) {
    return newText ? replaceContent(n, [document.createTextNode(newText)]) : clearContent(n);
    return n;
  }
  return false;
}
export function updateClasses(node, remove, add) {
  var c = node.getAttribute('class');
  var s = new Set(c ? c.split(' ') : []);
  for (const i in remove) {
    s.delete(remove[i]);
  }
  for (const i in add) {
    s.add(add[i]);
  }
  node.setAttribute('class', Array.from(s).join(' '));
  return node;
}
export function hasClass(node, cls) {
  var c = node.getAttribute('class');
  if (!c) {
    return false;
  }
  return c.split(' ').includes(cls);
}
export function updateNodeClasses(nodeID, remove, add) {
  return updateClasses(document.getElementById(nodeID), remove, add);
}
