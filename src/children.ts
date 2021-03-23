import { VNode } from "@opennetwork/vnode";
import { ElementDOMNativeVNode } from "./element";
import { merge, MergeInput } from "@opennetwork/progressive-merge";
import { FragmentDOMNativeVNode, isFragmentDOMNativeVNode } from "./fragment";
import { Native } from "./native";
import { withOptions } from "./with-options";

export async function *children(node: VNode): AsyncIterable<ReadonlyArray<ElementDOMNativeVNode>> {
  if (!node.children) return;
  for await (const children of node.children) {
    for await (const parts of merge(children.map(withOptions({}, Native)).map(hydratedChildren))) {
      yield Object.freeze(
        parts.reduce(
          (updates: ElementDOMNativeVNode[], part: ElementDOMNativeVNode[] | undefined): ElementDOMNativeVNode[] => updates.concat(part || []),
          []
        )
      );
    }
  }

  function hydratedChildren(node: FragmentDOMNativeVNode | ElementDOMNativeVNode): MergeInput<ReadonlyArray<ElementDOMNativeVNode>> {
    return isFragmentDOMNativeVNode(node) ? node.children : [Object.freeze([node])];
  }
}
