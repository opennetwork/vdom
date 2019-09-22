import { Fragment, VNode } from "@opennetwork/vnode";
import { produce } from "./produce";
import { asyncExtendedIterable, asyncIterable, AsyncIterableLike, isPromise } from "iterable";
import { DOMNativeVNode, HydratedDOMNativeVNode } from "./native";
import { ListAsyncIterable } from "./branded-iterables";
import { EXPERIMENT_attributeMode, EXPERIMENT_attributes, EXPERIMENT_onAttached } from "./experiments";

export type DOMRoot = Node & ParentNode;

export async function render(vnode: AsyncIterableLike<VNode>, root: DOMRoot, atIndex: number = 0): Promise<void> {
  for await (const nodes of produce(asyncIterable(vnode))) {
    await replaceChildren(root, nodes, atIndex);
  }
}

function isText(node?: Node): node is Text {
  return !!node && typeof node.nodeType === "number" && node.nodeType === node.TEXT_NODE;
}

function isElement(node?: Node): node is Element {
  return !!node && typeof node.nodeType === "number" && node.nodeType === node.ELEMENT_NODE;
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

  // TODO settle all, collect errors
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
      await setAttributes(child, node);
    }

    if (child.options && typeof child.options[EXPERIMENT_onAttached] === "function") {
      const returnedValue = child.options[EXPERIMENT_onAttached](node);
      if (isPromise(returnedValue)) {
        await returnedValue;
      }
    }

    if (isElement(node)) {
      const promise = replaceChildrenForNode(child, node);
      addChildPromise(promise);
    }
  }

  async function replaceChildrenForNode(parent: HydratedDOMNativeVNode, documentNode: Element) {
    await render(
      [
        {
          reference: Fragment,
          children: parent.children
        }
      ],
      documentNode,
      0
    );
  }


  function addChildPromise(promise: Promise<void>) {
    promise.then(remove, remove);
    childPromises.push(promise);
    setupChildErrorPromise();
    function remove() {
      removeChildPromise(promise);
    }
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
    if (isText(node.options.instance)) {
      return node.options.instance;
    }
    return root.ownerDocument.createTextNode(node.source);
  }
  if (node.options.type !== "Element") {
    throw new Error("type must be Text or Element");
  }
  if (isElement(node.options.instance)) {
    return node.options.instance;
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

async function setAttributes(node: HydratedDOMNativeVNode, documentNode: Element) {
  const attributes = node.options[EXPERIMENT_attributes];
  if (!attributes) {
    return;
  }
  const attributeMode = node.options[EXPERIMENT_attributeMode] || "exact";

  const keys = Array.isArray(attributes) ? attributes : Object.keys(attributes);

  if (attributeMode === "remove") {
    keys.forEach(key => documentNode.removeAttribute(key));
    return;
  }

  if (Array.isArray(attributes)) {
    throw new Error("Expected object for attributes when using set or exact (default)");
  }

  const lowerKeys = keys.map(key => key.toLowerCase());

  const duplicates = lowerKeys.filter(
    (value, index, array) => {
      const before = array.slice(0, index);
      return before.includes(value);
    }
  );

  if (duplicates.length) {
    throw new Error(`Duplicate keys found for ${duplicates.join(", ")}, this will lead to unexpected behaviour, and is not supported`);
  }

  // Don't use lower keys here as we need to access attributes
  keys.forEach(key => {
    documentNode.setAttribute(key, attributes[key]);
  });

  if (attributeMode !== "exact") {
    return;
  }

  const attributesLength = documentNode.attributes.length;

  // Assume we set all of these attributes, and don't need to check further if there
  if (attributesLength === keys.length) {
    return;
  }

  const toRemove = [];

  for (let attributeIndex = 0; attributeIndex < attributesLength; attributeIndex += 1) {
    const attribute = documentNode.attributes.item(attributeIndex);
    if (lowerKeys.includes(attribute.name)) {
      continue;
    }
    toRemove.push(attribute.name);
  }

  toRemove.forEach(key => documentNode.removeAttribute(key));

}
