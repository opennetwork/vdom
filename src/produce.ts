import { VNode } from "@opennetwork/vnode/src/vnode";
import {
  getHydratedDOMNativeVNode,
  HydratedDOMNativeVNode,
  isDOMNativeVNode,
  isNativeCompatible,
  native
} from "./native";
import {
  asyncExtendedIterable
} from "iterable";
import { Fragment, FragmentVNode } from "@opennetwork/vnode";

export async function *produce(node: VNode): AsyncIterable<FragmentVNode | HydratedDOMNativeVNode> {
  if (isDOMNativeVNode(node)) {
    yield getHydratedDOMNativeVNode({
      ...node,
      children: produceChildren(node)
    });
  } else if (isNativeCompatible(node)) {
    yield* produce(native(undefined, node));
  } else {
    yield {
      reference: Fragment,
      children: produceChildren(node)
    };
  }
}

async function *produceChildren(node: VNode): AsyncIterable<AsyncIterable<FragmentVNode | HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    yield asyncExtendedIterable(children).flatMap(child => produce(child));
  }
}

