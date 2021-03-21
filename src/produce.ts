import { VNode } from "@opennetwork/vnode/src/vnode";
import {
  getHydratedDOMNativeVNode,
  HydratedDOMNativeVNode,
  isDOMNativeVNode,
  isNativeCompatible,
  native
} from "./native";
import { Fragment, FragmentVNode } from "@opennetwork/vnode";

export function produce(node: VNode): FragmentVNode | HydratedDOMNativeVNode {
  if (isDOMNativeVNode(node)) {
    return getHydratedDOMNativeVNode({
      ...node,
      children: produceChildren(node)
    });
  } else if (isNativeCompatible(node)) {
    return produce(native(node.options, node));
  } else if (node && node.children) {
    return {
      ...node,
      reference: Fragment,
      children: produceChildren(node),
    };
  } else {
    return {
      ...node,
      reference: Fragment
    };
  }
}

async function *produceChildren(node: VNode): AsyncIterable<ReadonlyArray<FragmentVNode | HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    yield children.map(produce);
  }
}

