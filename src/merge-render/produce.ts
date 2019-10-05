import { VNode } from "@opennetwork/vnode/src/vnode";
import {
  getHydratedDOMNativeVNode,
  HydratedDOMNativeVNode,
  isDOMNativeVNode,
  isNativeCompatible,
  native
} from "../native";
import {
  asyncExtendedIterable
} from "iterable";
import { Fragment, FragmentVNode } from "@opennetwork/vnode";

export function produce(node: VNode): FragmentVNode | HydratedDOMNativeVNode {
  if (isDOMNativeVNode(node)) {
    return getHydratedDOMNativeVNode({
      ...node,
      children: produceChildren(node)
    });
  } else if (isNativeCompatible(node)) {
    return produce(native(undefined, node));
  } else {
    return {
      reference: Fragment,
      children: produceChildren(node)
    };
  }
}

async function *produceChildren(node: VNode): AsyncIterable<AsyncIterable<FragmentVNode | HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    yield asyncExtendedIterable(children).map(child => produce(child));
  }
}

