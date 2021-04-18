import { isNativeOptions, NativeOptions } from "./options";
import {
  isMarshalledSourceReference,
  isNativeVNode,
  isVNode,
  MarshalledSourceReference,
  NativeVNode,
  VNode
} from "@opennetwork/vnode";
import { children } from "./children";

const DOMNativeVNodeSymbol = Symbol("DOM Native VNode");

export interface DOMNativeVNode extends NativeVNode {
  source: string;
  options: NativeOptions;
  children: AsyncIterable<DOMNativeVNode[]>;
  [DOMNativeVNodeSymbol]: true;
}

export interface DOMNativeCompatibleVNode extends VNode {
  source: MarshalledSourceReference;
}

export function createVNode(node: DOMNativeCompatibleVNode, options: NativeOptions) {
  const native: DOMNativeVNode = {
    ...node,
    source: String(node.source),
    reference: node.reference || Symbol("@opennetwork/vdom/native"),
    native: true,
    // We're going to git these children a few times, so we want to retain our values
    children: children(node),
    options,
    [DOMNativeVNodeSymbol]: true
  };
  assertDOMNativeVNode(native);
  return native;
}

export function isDOMNativeVNode(node: VNode): node is DOMNativeVNode {
  function isDOMNativeNodeLike(node: VNode): node is VNode & { [DOMNativeVNodeSymbol]?: unknown } {
    return isVNode(node);
  }
  return (
    isDOMNativeNodeLike(node) &&
    node[DOMNativeVNodeSymbol] === true &&
    isNativeVNode(node) &&
    typeof node.source === "string" &&
    isNativeOptions(node.options) &&
    node.native === true
  );
}

export function assertDOMNativeVNode(node: VNode): asserts node is DOMNativeVNode {
  if (!isDOMNativeVNode(node)) {
    throw new Error("Expected DOMNativeVNode");
  }
}

export function isDOMNativeCompatibleVNode(node: VNode): node is DOMNativeCompatibleVNode {
  return isMarshalledSourceReference(node.source);
}
