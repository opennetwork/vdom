import { HydratedDOMNativeVNode } from "./native";
import { EXPERIMENT_getDocumentNode } from "./experiments";
import { isPromise } from "iterable";

export function isNode(value: unknown): value is Node {
  function isNodeLike(value: unknown): value is { nodeType?: unknown, TEXT_NODE?: unknown, ELEMENT_NODE?: unknown } {
    return !!value;
  }
  return (
    isNodeLike(value) &&
    typeof value.nodeType === "number" &&
    typeof value.TEXT_NODE === "number" &&
    typeof value.ELEMENT_NODE === "number"
  );
}

export function isText(node?: unknown): node is Text {
  return isNode(node) && typeof node.nodeType === "number" && node.nodeType === node.TEXT_NODE;
}

export function isElement(node?: unknown): node is Element {
  return isNode(node) && typeof node.nodeType === "number" && node.nodeType === node.ELEMENT_NODE;
}

export function isExpectedNode(expected: HydratedDOMNativeVNode, given: ChildNode): given is (Text | Element) {
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
  return expected.source === given.localName;
}

export async function getDocumentNode(root: Element, node: HydratedDOMNativeVNode): Promise<Text | Element> {
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
          throw new Error(`Expected getDocumentNode to return an Element node with the localName ${node.source}, but didn't receive this`);
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
  return root.ownerDocument.createElement(node.source, { is: node.options.is });
}
