import { VNode } from "@opennetwork/vnode/src/vnode";
import {
  getHydratedDOMNativeVNode,
  HydratedDOMNativeVNode,
  isDOMNativeVNode,
  isNativeCompatible,
  native
} from "./native";
import {
  asyncExtendedIterable,
  asyncIterable
} from "iterable";
import { merge } from "./merge";
import {
  getListAsyncIterable,
  getListUpdaterAsyncIterable,
  ListAsyncIterable,
  ListUpdaterAsyncIterable
} from "./branded-iterables";

export function produce(node: VNode): ListUpdaterAsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
  return getListUpdaterAsyncIterable(produceGenerator(node));

  async function *produceGenerator(node: VNode): AsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
    if (isDOMNativeVNode(node)) {
      const hydrated = getHydratedDOMNativeVNode({
        ...node,
        children: produceChildren(node)
      });
      yield getListAsyncIterable(asyncIterable([hydrated]));
    } else if (isNativeCompatible(node)) {
      yield* produce(native(undefined, node));
    } else {
      yield* produceChildren(node);
    }
  }
}

function produceChildren(node: VNode): ListUpdaterAsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {

  return getListUpdaterAsyncIterable(produceChildrenGenerator(node));

  async function *produceChildrenGenerator(node: VNode): AsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
    for await (const children of node.children) {
      yield* merge<HydratedDOMNativeVNode>(
        asyncExtendedIterable(children).map(produce)
      );
    }
  }

}

