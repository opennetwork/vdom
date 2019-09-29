import { Fragment, isFragmentVNode, VNode } from "@opennetwork/vnode";
import { produce } from "./produce";
import { asyncIterable, isPromise } from "iterable";
import { HydratedDOMNativeVNode, DOMRoot, isHydratedDOMNativeVNode } from "./native";
import {
  EXPERIMENT_attributeMode,
  EXPERIMENT_attributes,
  EXPERIMENT_getDocumentNode,
  EXPERIMENT_onAttached
} from "./experiments";
import { Blocks } from "./blocks";
import { Pointers } from "./pointers";

export async function render(initialNode: VNode, root: DOMRoot, atIndex: number = 0): Promise<void> {
  const blocks = new Blocks(undefined, undefined, atIndex).fragment(Symbol());
  const pointers = new Pointers();
  const rootNode = { reference: Fragment };
  for await (const node of produce(initialNode)) {
    await renderChildren(root, asyncIterable([node]), blocks, pointers, rootNode, true);
  }
}

function isText(node?: Node): node is Text {
  return !!node && typeof node.nodeType === "number" && node.nodeType === node.TEXT_NODE;
}

function isElement(node?: Node): node is Element {
  return !!node && typeof node.nodeType === "number" && node.nodeType === node.ELEMENT_NODE;
}

function isExpectedNode(expected: HydratedDOMNativeVNode, given: ChildNode): given is (Text | Element) {
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

async function renderChildren(documentNode: Element | DOMRoot, children: AsyncIterable<VNode>, blocks: Blocks, pointers: Pointers, parent: VNode, isOpen: boolean = false): Promise<number> {

  const childrenPromises: Promise<unknown>[] = [];

  try {
    for await (const child of children) {
      const pointer = isFragmentVNode(child) && blocks.isFragment() ? undefined : pointers.get(child, parent);
      if (pointer) {
        // This gives us a stable index
        blocks.getInfo(pointer);
      }
      childrenPromises.push(withChild(child, pointer));
    }
  } finally {
    // TODO accumulate all the errors from children
    await Promise.all(childrenPromises);
  }

  // All children will have been mounted here, so we must remove any additional
  return reduceDocumentNodeSize(blocks, documentNode, isOpen);

  function reduceDocumentNodeSize(blocks: Blocks, documentNode: Element | DOMRoot, isOpen: boolean): number {
    const expectedLength = blocks.size();
    if (!isOpen) {
      return expectedLength; // If we're not open, then we can't know if we can reduce in size
    }
    while (documentNode.childNodes.length > expectedLength) {
      documentNode.removeChild(documentNode.lastChild);
    }
    return expectedLength;
  }

  async function withChild(child: VNode, pointer: symbol): Promise<(Element | Text)[]> {

    if (isFragmentVNode(child)) {
      const fragmentBlock = blocks.isFragment() ? blocks : blocks.fragment(pointer);
      for await (const children of child.children) {
        await renderChildren(documentNode, children, fragmentBlock, pointers, parent, false);
      }
      return;
    }

    if (!isHydratedDOMNativeVNode(child)) {
      return;
    }

    const childDocumentNode = await mount(child);

    if (isElement(childDocumentNode)) {
      setAttributes(child, childDocumentNode);
    }

    if (child.options[EXPERIMENT_onAttached]) {
      await child.options[EXPERIMENT_onAttached](childDocumentNode);
    }

    if (isElement(childDocumentNode)) {
      const blocks = new Blocks();
      if (child.children) {
        for await (const children of child.children) {
          await renderChildren(childDocumentNode, children, blocks, pointers, child, true);
        }
      }
      reduceDocumentNodeSize(blocks, childDocumentNode, true);
    }

    async function mount(child: HydratedDOMNativeVNode): Promise<Element | Text> {
      const index = blocks.getIndexer(pointer);
      const previousLength = blocks.length(pointer);

      // We previously took up one space, so we know that we should be able to match
      if (previousLength === 1) {
        const existingCheckIndex = index();
        if (documentNode.childNodes.length > existingCheckIndex) {
          const currentChildDocumentNode = documentNode.childNodes.item(existingCheckIndex);
          if (isExpectedNode(child, currentChildDocumentNode)) {
            // TODO currentChildDocumentNode.replaceData(child.source);
            if (!isText(currentChildDocumentNode) || currentChildDocumentNode.textContent === child.source) {
              blocks.set(pointer, 1);
              return currentChildDocumentNode; // We're good to go, we statically know that we've got the correct value here
            }
          }
        }
      }

      const childDocumentNode: Element | Text = await getDocumentNode(documentNode, child);

      const previousChildrenLength = documentNode.childNodes.length;

      // We can replace something existing
      const currentIndex = index();

      if (child.source === "span") {
        console.log(blocks.length(pointer), blocks);
      }

      if (previousChildrenLength < currentIndex) {
        throw new Error(`Expected ${currentIndex} child${currentIndex === 1 ? "" : "ren"}, found ${previousChildrenLength}`);
      }

      if (previousChildrenLength === currentIndex) {
        documentNode.appendChild(childDocumentNode);
        blocks.set(pointer, 1);
        return childDocumentNode;
      }

      const previousChildDocumentNode = documentNode.childNodes.item(currentIndex);
      let mountedChildDocumentNode: Element | Text | ChildNode = previousChildDocumentNode;


      if (blocks.length(pointer) === 0) {
        // We never took up this space before, so lets create some room for us!
        mountedChildDocumentNode = childDocumentNode;
        documentNode.insertBefore(
          childDocumentNode,
          previousChildDocumentNode
        );
      } else {
        // We can still abort, we never attached our DOM node
        if (!isExpectedNode(child, previousChildDocumentNode) || (isText(previousChildDocumentNode) && previousChildDocumentNode.textContent !== child.source)) {
          mountedChildDocumentNode = childDocumentNode;
          documentNode.replaceChild(
            childDocumentNode,
            previousChildDocumentNode
          );
        }

        while (blocks.length(pointer) > 1 && mountedChildDocumentNode.nextSibling) {
          documentNode.removeChild(mountedChildDocumentNode.nextSibling);
          blocks.reduce(pointer, 1);
        }
      }

      blocks.set(pointer, 1);

      if (!(isElement(mountedChildDocumentNode) || isText(mountedChildDocumentNode))) {
        throw new Error("Expected Text or Element node");
      }

      return mountedChildDocumentNode;
    }
  }
}

async function getDocumentNode(root: DOMRoot, node: HydratedDOMNativeVNode): Promise<Text | Element> {
  if (typeof node.options[EXPERIMENT_getDocumentNode] === "function") {
    let result = node.options[EXPERIMENT_getDocumentNode](root, node);
    if (isPromise(result)) {
      result = await result;
    }
    if (result) {
      if (!isExpectedNode(node, result)) {
        if (node.options.type === "Text") {
          throw new Error(`Expected getDocumentNode to return a Text node`);
        } else if (node.options.type === "Element") {
          throw new Error(`Expected getDocumentNode to return an Element node with the localName ${node.source}${node.options.namespace ? `, and the namespace ${node.options.namespace}` : ""}, but didn't receive this`);
        } else {
          throw new Error(`getDocumentNode returned an unexpected node type, expected ${node.options.type}, see https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType`);

        }
      }
      return result;
    }
  }
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

function setAttributes(node: HydratedDOMNativeVNode, documentNode: Element) {
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
