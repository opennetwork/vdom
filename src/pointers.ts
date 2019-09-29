// For each node we want to know a static pointer we can use for referencing its location in blocks
import { isFragmentVNode, VNode } from "@opennetwork/vnode";
import { extendedIterable } from "iterable";

export class Pointers {

  private map = new WeakMap<VNode, Map<VNode, symbol>>();

  get(node: VNode, parent: VNode): symbol {
    let reference = node.reference;
    if (typeof reference === "symbol" && !isFragmentVNode(node)) {
      return reference; // We will always just use their symbol
    }
    const map = this.getParent(parent);
    reference = map.get(node);
    if (reference) {
      return reference;
    }
    reference = Symbol();
    map.set(node, reference);
    return reference;
  }

  private getParent(parent: VNode) {
    let map = this.map.get(parent);
    if (map) {
      return map;
    }
    map = new Map<VNode, symbol>();
    this.map.set(parent, map);
    return map;
  }

}
