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
import {
  asyncIterable,
  Cancellable, SimpleCancellable
} from "iterable";
import { apply, slice } from "@opennetwork/vgraph";
import { getDocumentNode, isElement, isText } from "./document-node";
import { EXPERIMENT_onAttached } from "../experiments";
import { setAttributes } from "./attributes";

export async function render(initialNode: VNode, root: DOMRoot, initialIndex: number = 0, cancellable?: Cancellable): Promise<void> {
  console.log("Render", initialNode);

  if (!initialNode) {
    return;
  }

  const fragment = getFragment(initialNode);

  // This context will drain any tree it is given
  const context: VContext = {
    hydrate: (node, tree) => hydrateChildren(context, node, tree)
  };

  const slices = slice(fragment);

  const childrenPromises: Promise<void>[] = [],
    childrenNodes = new WeakMap<VNode, Element | Text>(),
    childrenCancellables: SimpleCancellable[] = [],
    forgottenPromises: Promise<void>[] = [];

  if (initialIndex > 0 && root.childNodes.length < initialIndex) {
    throw new Error(`Expected ${initialIndex} children`);
  }

  const same = Math.random();

  console.log("start", same);

  for await (const instructions of slices) {

    // console.log("instructions", same);

    let index = initialIndex - 1;

    for await (const child of instructions.children) {
      // console.log("child", same, child, index);

      if (isCancelled()) {
        break;
      }

      if (isFragmentVNode(child.node)) {
        continue;
      }

      if (!isHydratedDOMNativeVNode(child.node)) {
        throw new Error("Expected HydratedDOMNativeVNode");
      }

      index += 1;

      // if (!child.apply) {
      //
      //   const currentDocumentNode = root.childNodes.item(index);
      //
      //   if (isElement(currentDocumentNode)) {
      //     await setAttributes(child.node, currentDocumentNode);
      //   }
      //
      //   if (child.node.options[EXPERIMENT_onAttached] && (isText(currentDocumentNode) || isElement(currentDocumentNode))) {
      //     child.node.options[EXPERIMENT_onAttached](currentDocumentNode);
      //   }
      //
      //   continue;
      // }

      const currentDocumentNode = childrenNodes.get(child.node);

      if (currentDocumentNode && root.childNodes.item(index) === currentDocumentNode) {
        continue; // Nothing to do, we already have a valid mounted document node for this VNode
      }

      const documentNode = await getDocumentNode(root, child.node);

      if (root.childNodes.length <= index) {
        root.appendChild(documentNode);
      } else {
        root.replaceChild(
          documentNode,
          root.childNodes.item(index)
        );
      }

      if (isElement(currentDocumentNode)) {
        await setAttributes(child.node, currentDocumentNode);
      }

      if (child.node.options[EXPERIMENT_onAttached]) {
        child.node.options[EXPERIMENT_onAttached](documentNode);
      }

      childrenNodes.set(child.node, documentNode);

      if (childrenCancellables[index]) {
        childrenCancellables[index].cancel();
      }

      if (childrenPromises[index]) {
        forgottenPromises.push(childrenPromises[index]);
      }

      // if (isElement(documentNode)) {
      //   childrenCancellables[index] = new SimpleCancellable();
      //   childrenPromises[index] = render({ reference: Fragment, children: child.node.children }, documentNode, 0, childrenCancellables[index]);
      // } else {
      //   childrenCancellables[index] = undefined;
      //   childrenPromises[index] = undefined;
      // }

    }

    while (index > root.childNodes.length) {
      root.removeChild(root.lastChild);
    }

    if (isCancelled()) {
      break;
    }

  }

  // Cancel all children
  childrenCancellables
    .filter(cancellable => !!cancellable)
    .forEach(cancellable => cancellable.cancel());

  // Wait for everything to settle
  await Promise.all([
    Promise.all(childrenPromises),
    Promise.all(forgottenPromises)
  ]);

  function equals(left: VNode, right: VNode) {
    if (!isHydratedDOMNativeVNode(left) || !isHydratedDOMNativeVNode(right)) {
      return false;
    }
    return (
      left.options.type === right.options.type &&
      (left.options.namespace || "") === (right.options.namespace || "") &&
      (left.options.is ||  "") === (right.options.is || "") &&
      left.options.instance === right.options.instance &&
      (left.options.whenDefined || false) === (right.options.whenDefined || false) &&
      left.source === right.source
    );
  }

  function isCancelled(): boolean {
    return !!(cancellable && (cancellable.cancelled || cancellable.reason || cancellable.requested));
  }

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
