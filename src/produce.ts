import { VNode } from "@opennetwork/vnode/src/vnode";
import { getHydratedDOMNativeVNode, HydratedDOMNativeVNode, isDOMNativeVNode, isNativeCompatible, native } from "./native";
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

export function produce(vnode: AsyncIterable<VNode>): ListUpdaterAsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
  return getListUpdaterAsyncIterable(produceGenerator(vnode));

  async function *produceGenerator(vnode: AsyncIterable<VNode>): AsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
    for await (const node of vnode) {
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
}

async function serialise(node: VNode): Promise<object> {
  return {
    ...node,
    children: await asyncExtendedIterable(node.children)
      .map(value => asyncExtendedIterable(value).map(serialise).toArray())
      .toArray()
  };
}

async function toString(node: VNode): Promise<string> {
  return JSON.stringify(await serialise(node));
}

function produceChildren(node: VNode): ListUpdaterAsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {

  return getListUpdaterAsyncIterable(produceChildrenGenerator(node));

  async function *produceChildrenGenerator(node: VNode): AsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
    for await (const children of node.children) {
      yield* merge<HydratedDOMNativeVNode>(
        asyncExtendedIterable(children).map(produceChild)
      );
    }
  }

  function produceChild(child: VNode): ListUpdaterAsyncIterable<ListAsyncIterable<HydratedDOMNativeVNode>> {
    return produce(asyncIterable([child]));
  }
}

