import { VNode } from "@opennetwork/vnode";
import { getNativeOptions, NativeOptions } from "./options";
import {
  ElementDOMNative,
  ElementDOMNativeVNode,
  isElementDOMNativeCompatibleVNode,
  isElementDOMNativeVNode
} from "./element";
import { FragmentDOMNative, FragmentDOMNativeVNode, isFragmentDOMNativeVNode } from "./fragment";

export type DOMNativeVNode = ElementDOMNativeVNode | FragmentDOMNativeVNode;

export function isDOMNativeVNode(node: VNode): node is DOMNativeVNode {
  return isElementDOMNativeVNode(node) || isFragmentDOMNativeVNode(node);
}

export function assertDOMNativeVNode(node: VNode): asserts node is DOMNativeVNode {
  if (!isDOMNativeVNode(node)) {
    throw new Error("Expected DOMNativeVNode");
  }
}

export function isNativeCompatible(vnode: VNode): boolean {
  return !!getNativeOptions(vnode);
}

export function Native(options: Partial<NativeOptions>, node: VNode): DOMNativeVNode {
  if (isDOMNativeVNode(node)) {
    return node;
  }
  const nativeOptions = getNativeOptions(node);
  if (nativeOptions && isElementDOMNativeCompatibleVNode(node)) {
    return ElementDOMNative(
      isNativeOptions(node.options) ? node.options : {
        ...nativeOptions,
        ...node.options,
      },
      node
    );
  } else {
    return FragmentDOMNative(
      options,
      node
    );
  }

  function isNativeOptions(options: unknown): options is NativeOptions {
    return options === nativeOptions;
  }
}




