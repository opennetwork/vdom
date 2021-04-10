import { VNode } from "@opennetwork/vnode";
import { ElementDOMNativeVNode, isElementDOMNativeVNode } from "./element";
import { LaneInput, merge } from "@opennetwork/progressive-merge";
import { FragmentDOMNativeVNode, isFragmentDOMNativeVNode } from "./fragment";
import { Native } from "./native";
import { withOptions } from "./with-options";
import { Input } from "@opennetwork/progressive-merge/dist/async";

export async function *children(node: VNode): AsyncIterable<ElementDOMNativeVNode[]> {
  if (!node.children) return;
  for await (const children of node.children) {
    if (!children.length) {
      continue;
    }
    if (children.every(isElementDOMNativeVNode)) {
      yield [...children];
      continue;
    }
    // We have a bunch of iterables, async or not, that will provide an array of
    // ElementDOMNativeVNode for each iteration
    const lanes: LaneInput<ElementDOMNativeVNode[]> = children
      .map(withOptions({}, Native))
      .map(elementChildren);
    const merged: AsyncIterable<ReadonlyArray<ElementDOMNativeVNode[] | undefined>> = merge(lanes);
    for await (const parts of merged) {
      yield parts.reduce<ElementDOMNativeVNode[]>(
        (updates , part) => updates.concat(part ?? []),
        []
      );
    }
  }

  function elementChildren(node: FragmentDOMNativeVNode | ElementDOMNativeVNode): Input<ElementDOMNativeVNode[]> {
    return isFragmentDOMNativeVNode(node) ? node.children : [[node]];
  }
}
