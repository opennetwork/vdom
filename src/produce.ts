import { VNode } from "@opennetwork/vnode/src/vnode";
import { getHydratedDOMNativeVNode, HydratedDOMNativeVNode, isDOMNativeVNode, isNativeCompatible, native } from "./native";
import {
  asyncExtendedIterable,
  asyncIterable
} from "iterable";
import { merge } from "./merge";

export async function *produce(vnode: AsyncIterable<VNode>): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
  for await (const node of vnode) {
    if (isDOMNativeVNode(node)) {
      yield asyncIterable([
        getHydratedDOMNativeVNode({
          ...node,
          children: asyncExtendedIterable(produceChildren(node)).retain()
        })
      ]);
    } else if (isNativeCompatible(node)) {
      yield* produce(native(undefined, node));
    } else {
      yield* produceChildren(node);
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

async function *produceChildren(node: VNode): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
  for await (const children of node.children) {
    console.log(node, { children });
    yield* asyncExtendedIterable(
      merge<HydratedDOMNativeVNode>(
        asyncExtendedIterable(children).map(produceChild).retain()
      )
    )
      .retain();
  }

  function produceChild(child: VNode): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
    return produce(asyncIterable([child]));
  }
}

