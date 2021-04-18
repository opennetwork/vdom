import { VNode } from "@opennetwork/vnode";
import { getNativeOptions, NativeOptions } from "./options";
import {
  DOMNativeVNode,
  createVNode as createNode,
  isDOMNativeCompatibleVNode,
  isDOMNativeVNode
} from "./node";
import { FragmentDOMNative, FragmentDOMNativeVNode, isFragmentDOMNativeVNode } from "./fragment";

export type NativeVNode = DOMNativeVNode | FragmentDOMNativeVNode;

export function isNativeVNode(node: VNode): node is NativeVNode {
  return isDOMNativeVNode(node) || isFragmentDOMNativeVNode(node);
}

export function assertDOMNativeVNode(node: VNode): asserts node is NativeVNode {
  if (!isNativeVNode(node)) {
    throw new Error("Expected DOMNativeVNode or FragmentDOMNativeVNode");
  }
}

export function isNativeCompatible(vnode: VNode): boolean {
  return !!getNativeOptions(vnode);
}

export function Native(options: Partial<NativeOptions>, node: VNode): NativeVNode {
  if (isNativeVNode(node)) {
    return node;
  }
  const nativeOptions = getNativeOptions(node);
  if (nativeOptions && isDOMNativeCompatibleVNode(node)) {
    return createNode(
      node,
      isNativeOptions(node.options) ? node.options : {
        ...nativeOptions,
        ...node.options,
      }
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




