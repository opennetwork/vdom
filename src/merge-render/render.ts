import {
  Fragment,
  FragmentVNode,
  hydrate,
  hydrateChildren,
  isFragmentVNode,
  VContext,
  VNode
} from "@opennetwork/vnode";
import { DOMRoot, HydratedDOMNativeVNode, isHydratedDOMNativeVNode } from "../native";
import { produce } from "../render/produce";
import { source, asyncExtendedIterable, asyncIterable, TransientAsyncIteratorSource } from "iterable";
import { merge } from "@opennetwork/progressive-merge";

export async function render(initialNode: VNode, root: DOMRoot, index: number = 0): Promise<void> {
  if (!initialNode) {
    return;
  }

  const fragment = getFragment(initialNode);

  // This context will drain any tree it is given
  const context: VContext = {
    hydrate: (node, tree) => hydrateChildren(context, node, tree)
  };

  for await (const layer of mergeFan(fanFragment(fragment))) {

    for await (const child of layer) {



    }

  }


}

async function *mergeFan(fan: AsyncIterable<AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>>>): AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>> {
  const values: HydratedDOMNativeVNode[][] = [];
  for await (const layer of merge(fan, undefined)) {
    yield (async function *layerGenerator() {
      let index = -1;
      for await (const value of layer) {
        index += 1;
        if (!value) {
          continue;
        }
        if (value.done) {
          // Utilise the previously known value
          yield* (values[index] || []);
        } else {
          values[index] = value.value;
          yield* value.value;
        }
      }
    })();
  }
}

async function *fanFragment(fragment: FragmentVNode): AsyncIterable<AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>>> {
  let childrenTargets: TransientAsyncIteratorSource<AsyncIterable<HydratedDOMNativeVNode>>[] = [],
    childrenValues: WeakSet<VNode>[] = [];
  for await (const children of fragment.children) {
    let index = -1;
    for await (const child of children) {
      index += 1;
      const yieldTarget = !childrenTargets[index];
      const target = childrenTargets[index] = childrenTargets[index] || source();
      const values = childrenValues[index] = childrenValues[index] || new WeakSet<VNode>();
      if (values.has(child)) {
        continue;
      }
      values.add(child);
      if (isFragmentVNode(child)) {
        await target.setSource(mergeFan(fanFragment(child)));
      } else if (isHydratedDOMNativeVNode(child)) {
        target.push(asyncIterable([child]));
      }
      if (yieldTarget) {
        yield target;
      }
    }
    // Close out what we didn't use
    childrenTargets.slice(index).forEach(target => target.close());
    // Slice out what we used for next time
    childrenTargets = childrenTargets.slice(0, index);
    childrenValues = childrenValues.slice(0, index);
  }
  // None of these targets will ever receive a new value
  childrenTargets.forEach(target => target.close());
}

function getFragment(initialNode: VNode): FragmentVNode {
  const node = produce(initialNode);

  if (isFragmentVNode(node)) {
    return node;
  }

  return {
    reference: Fragment,
    children: asyncIterable([
      asyncIterable([node])
    ])
  };
}
