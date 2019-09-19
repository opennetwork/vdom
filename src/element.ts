import {
  Fragment,
  isScalarVNode,
  isSourceReference,
  VNode
} from "@opennetwork/vnode";
import {
  isPromise
} from "iterable";

export interface ElementFactory {
  (root: Node & ParentNode, nextNode: VNode, currentNode: VNode, currentDocumentNode: HTMLElement | Text | undefined): HTMLElement | Text | undefined | Promise<HTMLElement | Text | undefined>;
}

function isWhenDefined(options: unknown): options is { whenDefined: true } {
  function isWhenDefinedLike(options: unknown): options is { whenDefined?: unknown } {
    return !!options;
  }
  return (
    isWhenDefinedLike(options) &&
    options.whenDefined === true
  );
}

function isIsOptions(options: unknown): options is { is: string } {
  function isIsOptionsLike(options: unknown): options is { is?: unknown } {
    return !!options;
  }
  return (
    isIsOptionsLike(options) &&
    typeof options.is === "string"
  );
}

function isSimilarVNode(left: VNode, right: VNode): boolean {
  return (
    left &&
    right &&
    left.source === right.source &&
    left.reference === right.reference &&
    (
      (!left.options && !right.options) ||
      (!!left.options && !!right.options)
    ) &&
    (
      (!left.children && !right.children) ||
      (!!left.children && !!right.children)
    )
  );
}

export async function elementFactory(root: Node & ParentNode, nextNode: VNode, factory: ElementFactory | undefined, currentNode: VNode, currentDocumentNode: HTMLElement | Text | undefined): Promise<HTMLElement | Text | undefined> {
  if (nextNode.reference === Fragment) {
    throw new Error("Didn't expect a fragment here");
  }
  if (typeof factory === "function") {
    let result = factory(root, nextNode, currentNode, currentDocumentNode);
    if (isPromise(result)) {
      result = await result;
    }
    if (result) {
      return result;
    }
  }
  // Everything but a symbol can be a node, if you want to reference a symbol for a node, use a custom factory
  if (typeof nextNode.source === "symbol" || !isSourceReference(nextNode.source)) {
    return undefined;
  }
  // Retain previous documentNode if the vnode is of similar shape & same reference
  if (currentNode && currentDocumentNode && isSimilarVNode(currentNode, nextNode)) {
    return currentDocumentNode;
  }
  const documentNode = await getNode();
  if (!documentNode) {
    return undefined;
  }
  return currentDocumentNode;

  async function getNode(): Promise<HTMLElement | Text> {
    // If we have no given options, then we have a text node
    if (isScalarVNode(nextNode) && !nextNode.options && typeof nextNode.source !== "symbol") {
      return root.ownerDocument.createTextNode(nextNode.source.toString());
    }

    // We can only create elements from string sources
    if (typeof nextNode.source !== "string") {
      return undefined;
    }

    // If we're wanting to wait, wait, but only if we can
    if (isWhenDefined(nextNode.options) && root.ownerDocument.defaultView.customElements && root.ownerDocument.defaultView.customElements.whenDefined) {
      await root.ownerDocument.defaultView.customElements.whenDefined(nextNode.source);
    }

    return root.ownerDocument.createElement(nextNode.source, isIsOptions(nextNode.options) ? { is: nextNode.options.is } : undefined);
  }
}
