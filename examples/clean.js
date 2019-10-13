export function clean(node) {
  const remove = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index];
    if (child.nodeType !== child.TEXT_NODE && child.nodeType !== child.ELEMENT_NODE) {
      remove.push(child);
    }
    clean(child);
  }
  remove.forEach(child => node.removeChild(child));
}
