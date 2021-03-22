import { VNode } from "@opennetwork/vnode/src/vnode";
import {
  getHydratedDOMNativeVNode,
  HydratedDOMNativeVNode,
  isDOMNativeVNode,
  isNativeCompatible,
  native
} from "./native";
import { Fragment, FragmentVNode, isFragmentVNode } from "@opennetwork/vnode";
import { merge, MergeInput } from "@opennetwork/progressive-merge";

export interface FragmentHydratedDOMNativeVNode extends FragmentVNode {
  children?: AsyncIterable<ReadonlyArray<HydratedDOMNativeVNode>>;
}

export function produce(node: VNode): FragmentHydratedDOMNativeVNode | HydratedDOMNativeVNode {
  if (isDOMNativeVNode(node)) {
    return getHydratedDOMNativeVNode({
      ...node,
      children: produceChildren(node)
    });
  } else if (isNativeCompatible(node)) {
    return produce(native(node.options, node));
  }
  return {
    ...node,
    reference: Fragment,
    children: node.children ? produceChildren(node) : undefined,
  };
}

async function *produceChildren(node: VNode): AsyncIterable<ReadonlyArray<HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    for await (const parts of merge(children.map(produce).map(hydratedChildren))) {
      yield Object.freeze(
        parts.reduce(
          (updates: HydratedDOMNativeVNode[], part: HydratedDOMNativeVNode[] | undefined): HydratedDOMNativeVNode[] => updates.concat(part || []),
          []
        )
      );
    }
  }

  function hydratedChildren(node: FragmentHydratedDOMNativeVNode | HydratedDOMNativeVNode): MergeInput<ReadonlyArray<HydratedDOMNativeVNode>> {
    return isFragmentVNode(node) ? node.children : [Object.freeze([node])];
  }
}

