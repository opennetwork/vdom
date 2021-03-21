import {
  isNativeVNode,
  NativeVNode,
  VNode
} from "@opennetwork/vnode";
import { asyncExtendedIterable } from "iterable";
import { NativeOptions, isNativeOptions, getNativeOptions } from "./options";

export interface DOMNativeVNode extends NativeVNode {
  source: string;
  options: NativeOptions;
}

const HydratedDOMNativeVNodeSymbol = Symbol("Hydrated DOM Native VNode");

export interface HydratedDOMNativeVNode extends DOMNativeVNode {
  hydrated: true;
  children?: AsyncIterable<ReadonlyArray<HydratedDOMNativeVNode>>;
  [HydratedDOMNativeVNodeSymbol]: true;
}

export function getHydratedDOMNativeVNode(node: DOMNativeVNode): HydratedDOMNativeVNode {
  const nextNode: DOMNativeVNode & { [HydratedDOMNativeVNodeSymbol]: true } = {
    ...node,
    hydrated: true,
    [HydratedDOMNativeVNodeSymbol]: true
  };
  if (!isHydratedDOMNativeVNode(nextNode)) {
    throw new Error("isHydratedDOMNativeVNode returned false when we expected it to return true");
  }
  return nextNode;
}

export function isHydratedDOMNativeVNode(node: VNode): node is HydratedDOMNativeVNode {
  function isHydratedDOMNativeVNodeLike(node: VNode): node is DOMNativeVNode & { [HydratedDOMNativeVNodeSymbol]?: unknown } {
    return isDOMNativeVNode(node);
  }
  return (
    isHydratedDOMNativeVNodeLike(node) &&
    node[HydratedDOMNativeVNodeSymbol] === true
  );
}

export function isDOMNativeVNode(node: VNode): node is DOMNativeVNode {
  return (
    isNativeVNode(node) &&
    typeof node.source === "string" &&
    isNativeOptions(node.options)
  );
}

export function isNativeCompatible(vnode: VNode): boolean {
  return !!getNativeOptions(vnode);
}

export function native(options: object, children: VNode): VNode {
  const nativeOptions = getNativeOptions(children);
  if (!nativeOptions) {
    return children;
  } else {
    return {
      source: String(children.source),
      reference: children.reference || Symbol("@opennetwork/vdom/native"),
      native: true,
      options: nativeOptions,
      // We're going to git these children a few times, so we want to retain our values
      children: asyncExtendedIterable(children.children).retain()
    };
  }
}
