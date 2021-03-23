import { createVContextEvents, Tree, VContext, VContextEventsPair, VNode, WeakVContext, hydrateChildren } from "@opennetwork/vnode";
import { assertDOMNativeVNode } from "./native";
import { isFragmentDOMNativeVNode } from "./fragment";
import { isElementDOMNativeVNode } from "./element";
import { isElement, isExpectedNode, isText } from "./document-node";
import { NativeOptionsVNode } from "./options";
import { setAttributes } from "./attributes";
import { getDocumentNode } from "./document-node";

export interface RenderOptions {
  root: Element;
}

export class DOMVContext extends WeakVContext {

  constructor(private options: RenderOptions, weak?: WeakMap<object, unknown>, eventsPair: VContextEventsPair = createVContextEvents()) {
    super(weak, eventsPair);
  }

  async hydrate(node: VNode, tree?: Tree) {
    if (tree?.parent?.reference === "button1") {
      console.log(tree);
    }
    assertDOMNativeVNode(node);
    if (isFragmentDOMNativeVNode(node)) {
      return this.hydrateChildren(this.options.root, node, tree);
    } else if (isElementDOMNativeVNode(node)) {
      this.eventsTarget.hydrate.add({
        node,
        tree
      });
      const options = node.options;
      if (node.native && node.source && isHydrateOptions(options)) {
        return options.hydrate(node, tree);
      }
      const documentNode = await this.getDocumentNode(node);
      await this.commit(node, documentNode, tree);
      if (isElement(documentNode)) {
        await this.hydrateChildren(documentNode, node, tree);
        await this.complete(documentNode, tree);
      }
    }
  }

  private async getDocumentNode(node: NativeOptionsVNode) {
    const map = this.getVNodeWeakMap(node);
    const existingDocumentNode = map.get(this.options.root);
    if ((isElement(existingDocumentNode) || isText(existingDocumentNode)) && isExpectedNode(node, existingDocumentNode)) {
      return existingDocumentNode;
    }
    const documentNode = await getDocumentNode(this.options.root, node);
    map.set(this.options.root, documentNode);
    return documentNode;
  }

  private getVNodeWeakMap(node: NativeOptionsVNode): WeakMap<object, unknown> {
    const existing = this.weak.get(node);
    if (existing instanceof WeakMap) {
      return existing;
    }
    const map = new WeakMap();
    this.weak.set(node, map);
    return map;
  }

  private childContext(documentNode: Element) {
    const existingChildContext = this.weak.get(documentNode);
    if (existingChildContext instanceof DOMVContext) {
      return existingChildContext;
    }
    const childContext = new DOMVContext(
      {
        root: documentNode
      },
      this.weak,
      {
        events: this.events,
        target: this.eventsTarget
      }
    );
    this.weak.set(documentNode, childContext);
    return childContext;
  }

  async hydrateChildren(documentNode: Element, node: VNode, tree?: Tree) {
    await hydrateChildren(this.childContext(documentNode), node, tree);
  }

  async commit(node: NativeOptionsVNode, documentNode: Element | Text, tree?: Tree) {
    const { root } = this.options;
    const index = tree?.children.indexOf(node.reference) ?? -1;
    if (index === -1) {
      throw new Error("Could not find reference in tree");
    }
    if (index > 0 && root.childNodes.length < index) {
      throw new Error(`Expected ${index} children`);
    }
    if (root.childNodes.length <= index) {
      root.appendChild(documentNode);
    } else {
      const currentDocumentNode = root.childNodes.item(index);
      if (documentNode !== currentDocumentNode) {
        root.replaceChild(
          documentNode,
          currentDocumentNode
        );
      }
    }
    if (isElement(documentNode)) {
      await setAttributes(node, documentNode);
    }
  }

  async complete(documentNode: Element | Text, tree?: Tree) {
    let index = documentNode.childNodes.length - 1;
    while (index > tree.children.length) {
      const lastChild = documentNode.lastChild;
      if (!lastChild) break;
      documentNode.removeChild(lastChild);
      index -= 1;
    }
  }

}

function isHydrateOptions(options?: object): options is { hydrate: VContext["hydrate"] } {
  function isHydrateOptionsLike(options: unknown): options is { hydrate: unknown } {
    return !!options;
  }
  return isHydrateOptionsLike(options) && typeof options.hydrate === "function";
}
