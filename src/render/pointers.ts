// For each node we want to know a static pointer we can use for referencing its location in blocks
import { VNode } from "@opennetwork/vnode";

export class Pointers {

  private currentPointers = new WeakMap<VNode, symbol[]>();
  private availablePointers = new WeakMap<VNode, symbol[]>();

  get(parent: VNode): symbol {
    const currentPointers = this.currentPointers.get(parent) || [];
    const availablePointers = this.availablePointers.get(parent) || [];

    const pointer = availablePointers[currentPointers.length] ? availablePointers[currentPointers.length] : Symbol("Pointer");

    availablePointers[currentPointers.length] = pointer;
    currentPointers.push(pointer);

    this.currentPointers.set(parent, currentPointers);
    this.availablePointers.set(parent, availablePointers);

    return pointer;
  }

  reset(parent: VNode): void {
    this.currentPointers.delete(parent);
  }

  remaining(parent: VNode): symbol[] {
    const currentPointers = this.currentPointers.get(parent) || [];
    const availablePointers = this.availablePointers.get(parent) || [];
    return availablePointers.filter(pointer => !currentPointers.includes(pointer));
  }

}
