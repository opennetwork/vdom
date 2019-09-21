import { children, VNode } from "@opennetwork/vnode";
import { produce } from "./produce";
import { asyncExtendedIterable, asyncIterable } from "iterable";
import { DOMNativeVNode, HydratedDOMNativeVNode } from "./native";
import { getListAsyncIterable, ListAsyncIterable } from "./branded-iterables";

export type DOMRoot = Node & ParentNode;

export async function render(vnode: AsyncIterable<VNode>, root: DOMRoot, atIndex: number = 0): Promise<void> {
  for await (const nodes of produce(vnode)) {
    await replaceChildren(root, nodes, atIndex);
  }
}

function isText(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE;
}

function isElement(node: Node): node is Element {
  // Maybe I just need to check for ELEMENT_NODE, but lib.dom.d.ts comments that all the below refer to an element node
  return [node.ELEMENT_NODE, node.ENTITY_NODE, node.ENTITY_REFERENCE_NODE, node.NOTATION_NODE].includes(node.nodeType);
}

async function replaceChild(documentNode: DOMRoot, child: HydratedDOMNativeVNode, atIndex: number): Promise<Element | Text> {
  const length = documentNode.childNodes.length;
  // We're replacing
  if (length > atIndex) {
    const currentNode = documentNode.childNodes.item(atIndex);
    if (!currentNode) {
      throw new Error(`Expected child at index ${atIndex}`);
    }
    // Already there, so no need to update, we will replace the children next
    if (isElement(currentNode) && isExpectedNode(child, currentNode)) {
      return currentNode;
    }
    const childDocumentNode = await getDocumentNode(documentNode, child);
    documentNode.replaceChild(
      childDocumentNode,
      currentNode
    );
    return childDocumentNode;
  } else {
    // We're appending
    const childDocumentNode = await getDocumentNode(documentNode, child);
    documentNode.appendChild(childDocumentNode);
    return childDocumentNode;
  }
}

function isExpectedNode(expected: HydratedDOMNativeVNode, given: ChildNode): boolean {
  if (!given) {
    return false;
  }
  if (expected.options.type === "Text") {
    return isText(given);
  }
  if (expected.options.type !== "Element") {
    throw new Error(`Expected Element or Text, received ${expected.options.type}`);
  }
  // Maybe I just need to check for ELEMENT_NODE, but lib.dom.d.ts comments that all the below refer to an element node
  if (!isElement(given)) {
    return false;
  }
  // TODO find out if this value is mutated at all when used, which would result in a different value to check for
  if (expected.options.namespace && given.namespaceURI !== expected.options.namespace) {
    return false;
  }
  return expected.source === given.localName;
}

async function replaceChildren(documentNode: DOMRoot, nextChildren: ListAsyncIterable<HydratedDOMNativeVNode>, atIndex: number = 0): Promise<void> {

  if (atIndex < 0) {
    throw new Error("Expected index to be equal to or above 0");
  }

  if (atIndex !== 0) {
    const currentLength = documentNode.childNodes.length;
    if (currentLength < atIndex) {
      throw new Error(`When an index is used, all elements beforehand must already exist. Expected elements: ${atIndex}, found elements: ${currentLength}`);
    }
  }

  // A promise that will never resolve
  const deadPromise: Promise<void> = new Promise(() => {});
  const childPromises: Promise<void>[] = [];

  // We only want our childErrorPromise to throw, never resolve
  let childErrorPromise: Promise<void> = deadPromise;

  const previousChildNodes: HydratedDOMNativeVNode[] = [];
  const nextChildNodes = await asyncExtendedIterable(nextChildren)
    .filter(node => !!node)
    .tap(async child => {
      await Promise.race([
        nextChild(child),
        childErrorPromise
      ]);
    })
    .toArray();

  while (documentNode.childNodes.length > nextChildNodes.length) {
    documentNode.removeChild(documentNode.lastChild);
  }

  await Promise.all(childPromises);

  async function nextChild(child: HydratedDOMNativeVNode) {
    const currentExpectedChildNodes = previousChildNodes.slice();
    previousChildNodes.push(child);
    const previousIndex = currentExpectedChildNodes.length - 1;

    if (currentExpectedChildNodes[0]) {
      const previousIndex = currentExpectedChildNodes.length - 1;
      const previousExpectedNode = currentExpectedChildNodes[previousIndex];
      const previousFoundNode = documentNode.childNodes.item(previousIndex + atIndex);
      if (!isExpectedNode(previousExpectedNode, previousFoundNode)) {
        throw new Error("DOM has been tampered with during the render cycle!");
      }
    }
    const node = await replaceChild(documentNode, child, previousIndex + 1 + atIndex);

    if (isElement(node)) {
      const promise = replaceChildrenForNode(child, node);
      addChildPromise(promise);
    }
  }

  async function replaceChildrenForNode(parent: HydratedDOMNativeVNode, documentNode: Element) {
    for await (const update of asyncIterable(parent.children)) {
      await replaceChildren(documentNode, getListAsyncIterable(update), 0);
    }
  }


  function addChildPromise(promise: Promise<void>) {
    childPromises.push(promise);
    setupChildErrorPromise();
  }

  function removeChildPromise(promise: Promise<void>) {
    const index = childPromises.indexOf(promise);
    if (index > -1) {
      childPromises.splice(index, 1);
      setupChildErrorPromise();
    }
  }

  function setupChildErrorPromise() {
    // This can only throw when there is an issue
    childErrorPromise = Promise.all(childPromises)
      .then(() => deadPromise);
  }
}

async function getDocumentNode(root: DOMRoot, node: DOMNativeVNode): Promise<Text | Element> {
  if (node.options.type === "Text") {
    return root.ownerDocument.createTextNode(node.source);
  }
  if (node.options.type !== "Element") {
    throw new Error("type must be Text or Element");
  }
  if (node.options.whenDefined && root.ownerDocument.defaultView.customElements && root.ownerDocument.defaultView.customElements.whenDefined) {
    await root.ownerDocument.defaultView.customElements.whenDefined(node.source);
  }

  if (node.options.namespace) {
    return root.ownerDocument.createElementNS(node.options.namespace, node.source, { is: node.options.is });
  } else {
    return root.ownerDocument.createElement(node.source, { is: node.options.is });
  }
}
