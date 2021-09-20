export function clearContent(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  return node;
}

export function addContent(node, newContent) {
  // accept two kinds of content: arrays of nodes, and nodes.
  //
  // if newContent is an array, we add all array elements to the node.
  // if newContent is a node, we add that node.
  if (newContent instanceof Array) {
    for (const cnode in newContent) {
      node.appendChild(cnode);
    }
  } else if (newContent) {
    node.appendChild(newContent);
  }

  return node;
}

export function replaceContent(node, newContent) {
  return addContent(clearContent(node), newContent);
}

export function updateNodeText(nodeID, newText) {
  var n = document.getElementById(nodeID);
  if (n) {
    return newText ?
      replaceContent(n, document.createTextNode(newText)) :
      clearContent(n);
  }

  return n;
}

export function updateClasses(node, remove, add) {
  if (node) {
    var c = node.getAttribute('class');
    var cs = c ? c.split(' ') : [];
    var cf = cs.filter(function(s){
      return !(remove.includes(s) || add.includes(s));
    });

    for (const a in add) {
      cf.push(add[a]);
    }
    
    node.setAttribute('class', cf.join(' '));
  }

  return node;
}

export function hasClass(node, cls) {
  if (node) {
    var c = node.getAttribute('class');
    var cs = c ? c.split(' ') : [];

    return cs.includes(cls);
  }

  return false;
}

export function updateNodeClasses(nodeID, remove, add) {
  var node = document.getElementById(nodeID);
  return updateClasses(node, remove, add);
}
