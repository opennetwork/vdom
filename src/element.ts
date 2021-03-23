import { isNativeOptions, NativeOptions } from "./options";
import { isNativeVNode, isVNode, NativeVNode, SourceReference, VNode } from "@opennetwork/vnode";
import { children } from "./children";

const ElementDOMNativeVNodeSymbol = Symbol("Element DOM Native VNode");

export interface ElementDOMNativeVNode extends NativeVNode {
  reference: SourceReference;
  source: string;
  options: NativeOptions;
  children: AsyncIterable<ReadonlyArray<ElementDOMNativeVNode>>;
  [ElementDOMNativeVNodeSymbol]: true;
}

export interface ElementDOMNativeCompatibleVNode extends VNode {
  source: string;
}

export function ElementDOMNative(options: NativeOptions, node: ElementDOMNativeCompatibleVNode) {
  const native: ElementDOMNativeVNode = {
    ...node,
    source: node.source,
    reference: node.reference || Symbol("@opennetwork/vdom/native"),
    native: true,
    // We're going to git these children a few times, so we want to retain our values
    children: children(node),
    options,
    [ElementDOMNativeVNodeSymbol]: true
  };
  assertElementDOMNativeVNode(native);
  return native;
}

export function isElementDOMNativeVNode(node: VNode): node is ElementDOMNativeVNode {
  function isElementDOMNativeVNodeLike(node: VNode): node is VNode & { [ElementDOMNativeVNodeSymbol]?: unknown } {
    return isVNode(node);
  }
  return (
    isElementDOMNativeVNodeLike(node) &&
    node[ElementDOMNativeVNodeSymbol] === true &&
    isNativeVNode(node) &&
    typeof node.source === "string" &&
    isNativeOptions(node.options) &&
    node.native === true
  );
}

export function assertElementDOMNativeVNode(node: VNode): asserts node is ElementDOMNativeVNode {
  if (!isElementDOMNativeVNode(node)) {
    throw new Error("Expected DOMNativeVNode");
  }
}

export function isElementDOMNativeCompatibleVNode(node: VNode): node is ElementDOMNativeCompatibleVNode {
  return typeof node.source === "string";
}
