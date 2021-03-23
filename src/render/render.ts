import {
  createVNode,
  Fragment,
  hydrate,
  VNode,
  VContext,
  WeakVContext,
  hydrateChildren,
  Tree
} from "@opennetwork/vnode";
import { assertDOMNativeVNode, DOMNativeVNode, Native } from "../native";
import { Cancellable, SimpleCancellable } from "iterable";
import { getDocumentNode, isElement } from "../document-node";
import { setAttributes } from "../attributes";
import { assertElementDOMNativeVNode, ElementDOMNativeVNode } from "../element";
import { isFragmentDOMNativeVNode } from "../fragment";

export interface RootRenderOptions {
  root: Element;
}

export interface RenderOptions extends RootRenderOptions {
  cancellable?: Cancellable;
}

export async function *RenderChildren(options: RenderOptions, node: DOMNativeVNode): AsyncIterable<VNode> {
  const { root, index, cancellable, context } = options;
  if (index > 0 && root.childNodes.length < index) {
    throw new Error(`Expected ${index} children`);
  }

  const childrenCancellables: SimpleCancellable[] = [];
  const childrenNodes = new WeakMap<VNode, Element | Text>();

  let previousBatch: VNode[] = [];
  for await (const children of node.children) {
    const batch: VNode[] = [];
    const nodes = await Promise.all(
      children.map(async (child, index) => {
        const currentDocumentNode = childrenNodes.get(child);
        if (currentDocumentNode && root.childNodes.item(index) === currentDocumentNode) {
          return currentDocumentNode;
        } else {
          return getDocumentNode(root, child);
        }
      })
    );

    await invokeLifecycle(children, "onBeforeRender", nodes);

    let index = -1;
    for (const child of children) {
      index += 1;
      const documentNode = nodes[index];
      if (root.childNodes.length <= index) {
        root.appendChild(documentNode);
      } else {
        root.replaceChild(
          documentNode,
          root.childNodes.item(index)
        );
      }
      if (childrenNodes.get(child) !== documentNode) {
        childrenNodes.set(child, documentNode);
        if (childrenCancellables[index]) {
          childrenCancellables[index].cancel();
        }
        if (!isElement(documentNode)) {
          childrenCancellables[index] = undefined;
          continue;
        }
        batch[index] = createVNode(context, RenderChildren, {
          ...options,
          root: documentNode,
        });
      } else {
        batch[index] = previousBatch[index];
      }
    }

    await invokeLifecycle(children, "onConnected", nodes);
    await invokeLifecycle(children, "onRendered", nodes);
    console.log("hydrate children");
    await hydrate(context, createVNode(context, Fragment, {}, ...batch));
    previousBatch = batch;
  }

  async function invokeLifecycle(children: ReadonlyArray<ElementDOMNativeVNode>, fn: "onBeforeRender" | "onConnected" | "onRendered", nodes: (Element | Text)[]) {
    await Promise.all(
      children.map(
        async (child, index) => {
          const node = nodes[index];
          if (node) {
            await child.options[fn]?.(node);
          }
        }
      )
    );
  }


  try {
    updateCycle: for await (const children of node.children) {
      let index = 0;
      for (; index < (0 + children.length); index += 1) {
        // If we just got an update and have now been cancelled, we break, this will also break
        // the cycle if we are moving onto the next child
        if (isCancelled()) {
          break updateCycle;
        }
        const child = children[index];
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

      }

      // If we are just finishing our set of updates
      if (isCancelled()) {
        break;
      }

      while (index > root.childNodes.length) {
        root.removeChild(root.lastChild);
      }
    }
  } finally {
    // Cancel all children
    childrenCancellables
      .filter(cancellable => !!cancellable)
      .forEach(cancellable => cancellable.cancel());
  }

  function isCancelled(): boolean {
    return !!(cancellable && (cancellable.cancelled || cancellable.reason || cancellable.requested));
  }
}


export async function render(context: DOMContext, node: VNode | undefined): Promise<void> {
  if (!node) return;
  await hydrate(context, Native({}, createVNode({}, Fragment, {}, node)));
}

export class DOMContext extends WeakVContext {

  constructor(private options: RenderOptions) {
    super();

  }

  async hydrate(node: VNode, tree?: Tree) {
    assertDOMNativeVNode(node);
    if (isFragmentDOMNativeVNode(node)) {
      return this.hydrateChildren(this.options.root, node, tree);
    }
    assertElementDOMNativeVNode(node);
    this.eventsTarget.hydrate.add({
      node,
      tree
    });
    if (this.weak.has(node)) {
      // No need to do anything more
      return;
    }
    this.weak.set(node, true);
    const options = node.options;
    if (node.native && node.source && isHydrateOptions(options)) {
      return options.hydrate(node, tree);
    }
    const documentNode = await getDocumentNode(this.options.root, node);
    await this.commit(node, documentNode, tree);
    if (isElement(documentNode)) {
      await this.hydrateChildren(documentNode, node, tree);
    }
  }

  async hydrateChildren(documentNode: Element, node: VNode, tree?: Tree) {
    await hydrateChildren(this, node, tree);
  }

  async commit(node: VNode, documentNode: Element | Text, tree?: Tree) {
    const { root } = this.options;
    const index = tree?.children.indexOf(node.reference) ?? 0;
    if (index > 0 && root.childNodes.length < index) {
      throw new Error(`Expected ${index} children`);
    }
    if (root.childNodes.length <= index) {
      root.appendChild(documentNode);
    } else {
      root.replaceChild(
        documentNode,
        root.childNodes.item(index)
      );
    }
  }

}

function isHydrateOptions(options?: object): options is { hydrate: VContext["hydrate"] } {
  function isHydrateOptionsLike(options: unknown): options is { hydrate: unknown } {
    return !!options;
  }
  return isHydrateOptionsLike(options) && typeof options.hydrate === "function";
}
