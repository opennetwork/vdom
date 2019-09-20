import { VNode } from "@opennetwork/vnode/src/vnode";
import { getHydratedDOMNativeVNode, HydratedDOMNativeVNode, isDOMNativeVNode, isNativeCompatible, native } from "./native";
import {
  asyncExtendedIterable,
  asyncIterable
} from "iterable";
import { merge } from "./merge";

export async function *produce(vnode: AsyncIterable<VNode>): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
  for await (const node of vnode) {
    console.log({ node }, isNativeCompatible(node), isDOMNativeVNode(node));
    if (isNativeCompatible(node)) {
      yield* produce(native(undefined, node));
    } else if (!isDOMNativeVNode(node)) {
      yield* produceChildren(node);
    } else {
      yield asyncIterable([
        getHydratedDOMNativeVNode({
          ...node,
          children: produceChildren(node)
        })
      ]);
    }
    console.log("Yielded", { node });
  }
}

async function *produceChildren(node: VNode): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    yield* merge<HydratedDOMNativeVNode>(asyncExtendedIterable(children).map(produceChild));
  }

  function produceChild(child: VNode): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
    return produce(asyncIterable([child]));
  }
}
