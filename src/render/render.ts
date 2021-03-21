import { Fragment, FragmentVNode, isFragmentVNode, VNode } from "@opennetwork/vnode";
import { produce } from "../produce";
import { isHydratedDOMNativeVNode } from "../native";
import { Cancellable, SimpleCancellable } from "iterable";
import { getDocumentNode, isElement } from "../document-node";
import { setAttributes } from "../attributes";

export async function render(initialNode: VNode | undefined, root: Element, initialIndex: number = 0, cancellable?: Cancellable): Promise<void> {
  if (!initialNode) return;

  const fragment = getFragment(initialNode);

  if (initialIndex > 0 && root.childNodes.length < initialIndex) {
    throw new Error(`Expected ${initialIndex} children`);
  }

  let childrenPromises: Promise<void>[] = [];
  const childrenNodes = new WeakMap<VNode, Element | Text>(),
    childrenCancellables: SimpleCancellable[] = [],
    forgottenPromises: Promise<void>[] = [];

  try {
    updateCycle: for await (const children of fragment.children) {
      let index = initialIndex;
      for (; index < (initialIndex + children.length); index += 1) {
        // If we just got an update and have now been cancelled, we break, this will also break
        // the cycle if we are moving onto the next child
        if (isCancelled()) {
          break updateCycle;
        }
        const child = children[index];
        if (!isHydratedDOMNativeVNode(child)) {
          throw new Error("Expected HydratedDOMNativeVNode");
        }
        const currentDocumentNode = childrenNodes.get(child);
        if (currentDocumentNode && root.childNodes.item(index) === currentDocumentNode) {
          continue; // Nothing to do, we already have a valid mounted document node for this VNode
        }
        const documentNode = await getDocumentNode(root, child);
        if (child.options.onBeforeRender) {
          await child.options.onBeforeRender(documentNode);
        }
        if (root.childNodes.length <= index) {
          root.appendChild(documentNode);
        } else {
          root.replaceChild(
            documentNode,
            root.childNodes.item(index)
          );
        }
        if (isElement(currentDocumentNode)) {
          await setAttributes(child, currentDocumentNode);
        }
        if (child.options.onConnected) {
          await child.options.onConnected(documentNode);
        }
        if (child.options.onRendered) {
          await child.options.onRendered(documentNode);
        }
        childrenNodes.set(child, documentNode);
        if (childrenCancellables[index]) {
          childrenCancellables[index].cancel();
        }
        if (childrenPromises[index]) {
          forgottenPromises.push(childrenPromises[index]);
        }
        if (isElement(documentNode)) {
          childrenCancellables[index] = new SimpleCancellable();
          childrenPromises[index] = render({ reference: Fragment, children: child.children }, documentNode, 0, childrenCancellables[index]);
        } else {
          childrenCancellables[index] = undefined;
          childrenPromises[index] = undefined;
        }
      }

      // If we are just finishing our set of updates
      if (isCancelled()) {
        break;
      }

      while (index > root.childNodes.length) {
        root.removeChild(root.lastChild);
      }

      await Promise.all(childrenPromises);
      childrenPromises = [];
    }

    // This will throw any error we get
    await Promise.all([
      Promise.all(childrenPromises),
      Promise.all(forgottenPromises)
    ]);
  } finally {
    // Cancel all children
    childrenCancellables
      .filter(cancellable => !!cancellable)
      .forEach(cancellable => cancellable.cancel());

    // Wait for everything to settle
    await Promise.all([
      Promise.all(childrenPromises.map(async promise => promise ? promise.catch(noop) : undefined)),
      Promise.all(forgottenPromises.map(promise => promise.catch(noop)))
    ]);

    function noop() {}
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
    children: children()
  };

  async function *children() {
    yield Object.freeze([node]);
  }
}
