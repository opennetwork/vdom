import {
  VNode,
  hydrate,
  hydrateChildren,
  VContext,
  isFragmentVNode,
  FragmentVNode,
  Fragment
} from "@opennetwork/vnode";
import { DOMRoot, isHydratedDOMNativeVNode } from "../native";
import { Blocks } from "./blocks";
import { Pointers } from "./pointers";
import { produce } from "./produce";
import { source } from "iterable";
import { mountNode } from "./node";

export async function render(initialNode: VNode, root: DOMRoot, index: number = 0): Promise<void> {
  if (!initialNode) {
    return;
  }

  const blocks = new Blocks(undefined, undefined, () => index);
  const pointers = new Pointers();

  const node = produce(initialNode);

  // This context will drain an entire tree
  const context: VContext = {
    hydrate: (node, tree) => hydrateChildren(context, node, tree)
  };

  if (!isFragmentVNode(node)) {
    // Nothing more to do here, one to one render
    return await hydrate(context, node);
  }

  // Promises
  const promises: Promise<unknown>[] = [],
    promisesToHandle = source();

  let fragmentId = 0;

  promisesToHandle.hold();

  await Promise.all([
    withFragment(blocks, node, pointers.get(node, initialNode)).then(() => {
      // Nothing more will be produced
      promisesToHandle.close();
    }),
    handlePromises()
  ]);

  const currentSize = blocks.size();
  while (root.childNodes.length > currentSize) {
    console.log("Removing", root.lastChild);
    root.removeChild(root.lastChild);
  }

  async function withChildren(blocks: Blocks, children: AsyncIterable<VNode>, parent: VNode) {
    const childrenSource = source(children);

    const completionPromise = loadChildren();
    completionPromise.catch(() => {
      // Close off source if we run into an issue
      childrenSource.close();
    });
    await completionPromise;

    async function loadChildren() {
      for await (const child of children) {
        const pointer = pointers.get(child, parent);
        await withChild(blocks, pointer, child);
      }
      // We won't be loading any more promises
      promisesToHandle.close();
      await Promise.all(promises);
    }
  }

  async function withChild(blocks: Blocks, pointer: symbol, child: VNode) {
    if (isFragmentVNode(child)) {
      return withFragment(blocks, child, pointer);
    }
    if (!isHydratedDOMNativeVNode(child)) {
      return;
    }
    const promise = mountNode(
      {
        pointer,
        node: child,
        parent: root,
        fragment: blocks
      },
      {
        reference: Fragment,
        children: child.children
      }
    );
    promises.push(promise);
    // Push to our async loop once we've stored sync in our array
    promisesToHandle.push(promise);
    removePromiseOnceComplete(promise);
  }

  async function withFragment(blocks: Blocks, fragment: FragmentVNode, pointer: symbol) {
    const id = fragmentId += 1;
    const fragmentBlock = blocks.fragment(pointer);
    for await (const children of fragment.children) {
      console.log(id, { children });
      await withChildren(fragmentBlock, children, fragment);
      fragmentBlock.clearFragments();
    }
  }

  function removePromiseOnceComplete(promise: Promise<unknown>) {
    // If our promise fulfils, remove it from the promise list
    //
    // We want to retain error'd promises so we can nab the errors
    //
    // We still have a catch function as we will want to ensure we don't get an uncaught promise error, we will consume these
    promise.then(() => {
      const index = promises.indexOf(promise);
      if (index > -1) {
        promises.splice(index, 1);
      }
    }, () => {});
  }

  async function handlePromises() {
    const iterator = promisesToHandle[Symbol.asyncIterator]();
    let next;
    do {
      const nextPromise = iterator.next();
      // If we get an error here, we will directly throw it up
      // We have to do this outside of our
      await Promise.race([
        Promise.all(promises),
        nextPromise
      ]);
      // If we got here we either finished all our promises, or we have another promise
      next = await nextPromise;
    } while (!next.done);
  }
}
