import {
  createVContextEvents,
  Tree,
  VContext,
  VContextEventsPair,
  VNode,
  WeakVContext,
  hydrateChildren,
  SourceReference
} from "@opennetwork/vnode";
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

  private committing: Promise<void> = Promise.resolve();

  constructor(public options: RenderOptions, weak?: WeakMap<object, unknown>, eventsPair: VContextEventsPair = createVContextEvents()) {
    super(weak, eventsPair);
  }

  async hydrate(node: VNode, tree?: Tree) {
    if (tree?.parent?.reference === "button1") {
      console.log(tree);
    }
    assertDOMNativeVNode(node);
    if (isFragmentDOMNativeVNode(node)) {
      return this.commitChildren(this.options.root, node, tree);
    } else if (isElementDOMNativeVNode(node)) {
      if (!tree) {
        throw new Error("Expected a tree with ElementDOMNativeVNode, entry point should be a FragmentDOMNativeVNode");
      }
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
    }
  }

  protected async getDocumentNode(node: NativeOptionsVNode) {
    const map = this.getWeakMap(node);
    const existingDocumentNode = map.get(this.options.root);
    if ((isElement(existingDocumentNode) || isText(existingDocumentNode)) && isExpectedNode(node, existingDocumentNode)) {
      return existingDocumentNode;
    }
    const documentNode = await getDocumentNode(this.options.root, node);
    map.set(this.options.root, documentNode);
    return documentNode;
  }

  protected getWeakMap(key: object): WeakMap<object, unknown> {
    const existing = this.weak.get(key);
    if (existing instanceof WeakMap) {
      return existing;
    }
    const map = new WeakMap();
    this.weak.set(key, map);
    return map;
  }

  protected childContext(documentNode: Element) {
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
    const map = this.getWeakMap(childContext);
    map.set(documentNode, createDocumentNodeDetails());
    return childContext;
  }

  protected getElementDetails(documentNode: Element, tree?: Tree): ElementDetails {
    const map = this.getWeakMap(this);
    let elementDetails = map.get(documentNode);
    if (!tree && !elementDetails) {
      // If we have no tree, we can make them on the fly
      elementDetails = createDocumentNodeDetails();
      map.set(documentNode, elementDetails);
    }

    // If we are getting details from within a tree, we expect them!
    assertElementDetails(elementDetails);

    return elementDetails;

    function assertElementDetails(details: unknown): asserts details is ElementDetails {
      if (!isElementDetails(details)) {
        throw new Error("Expected ElementDetails");
      }
    }

    function isElementDetails(details: unknown): details is ElementDetails {
      function isElementDetailsLike(details: unknown): details is { rendered: unknown } {
        return !!details;
      }
      return isElementDetailsLike(details) && details.rendered instanceof Map;
    }
  }

  async commit(node: NativeOptionsVNode, documentNode: Element | Text, tree: Tree) {
    const { root } = this.options;
    // We are committing into the root element, we want to reference its details.
    const elementDetails = this.getElementDetails(root);

    const promise = this.committing.then(task);
    this.committing = promise;
    await promise;
    if (this.committing === promise) {
      // Does this help?
      this.committing = Promise.resolve();
    }
    await (this.committing = this.committing.then(task));

    if (isElement(documentNode)) {
      await this.commitChildren(documentNode, node, tree);
    }

    async function task() {
      if (node.options.onBeforeRender) {
        await node.options.onBeforeRender(documentNode);
      }

      if (node.options.onDisconnected) {
        elementDetails.disconnect.set(node.reference, node.options.onDisconnected);
      }

      const currentDocumentNode = elementDetails.rendered.get(node.reference);
      if (currentDocumentNode) {
        // We have a known node for this reference, lets replace that
        if (documentNode !== currentDocumentNode) {
          root.replaceChild(
            documentNode,
            currentDocumentNode
          );
          // Set rendered after adding to DOM, before setting attributes
          elementDetails.rendered.set(node.reference, documentNode);
        }
        if (isElement(documentNode)) {
          await setAttributes(node, documentNode);
        }
      } else {
        // We aren't included yet, lets see where we start

        // Because the node is not included, we can set our attributes ahead of time
        if (isElement(documentNode)) {
          await setAttributes(node, documentNode);
        }

        // If there is nothing rendered, lets append
        if (elementDetails.rendered.size === 0) {
          // When appending we can set our attributes beforehand
          root.appendChild(documentNode);
        } else {

          const treeIndex = tree.children.indexOf(node.reference);
          const treeAfter = tree.children.slice(treeIndex + 1);
          const renderedAfter = treeAfter.find(isRendered);

          if (renderedAfter) {
            const documentNodeAfter = elementDetails.rendered.get(renderedAfter);
            root.insertBefore(documentNode, documentNodeAfter);
          } else {
            const treeBeforeReversed = tree.children.slice(0, treeIndex).reverse();
            const renderedBefore = treeBeforeReversed.find(isRendered);
            if (!renderedBefore) {
              // Nothing before it, lets insert to the front
              root.insertBefore(
                documentNode,
                root.firstChild
              );
            } else {
              const documentNodeBefore = elementDetails.rendered.get(renderedBefore);
              const nextSibling = documentNodeBefore.nextSibling;
              if (nextSibling) {
                // The element before has a next sibling, and we don't know about it, so lets
                // insert before this
                root.insertBefore(
                  documentNode,
                  nextSibling
                );
              } else {
                // The element before is the last child
                root.appendChild(
                  documentNode
                );
              }
            }

          }
        }
        // Set rendered after added to DOM
        elementDetails.rendered.set(node.reference, documentNode);
      }

      // This will only run for the first child that was committed, each after will have no
      // removable until we have a different tree
      for (const [reference, removableDocumentNode] of getRemovableDocumentNodes()) {
        root.removeChild(removableDocumentNode);
        elementDetails.rendered.delete(reference);
        const disconnect = elementDetails.disconnect.get(node.reference);
        if (disconnect) {
          await disconnect(removableDocumentNode);
        }
      }

      if (node.options.onConnected) {
        await node.options.onConnected(documentNode);
      }
      if (node.options.onRendered) {
        await node.options.onRendered(documentNode);
      }
    }

    function isRendered(reference: SourceReference) {
      return elementDetails.rendered.has(reference);
    }

    function getRemovableDocumentNodes() {
      const renderedReferences = [...elementDetails.rendered.keys()];
      return renderedReferences
        .filter(reference => !tree.children.includes(reference))
        .map((reference): [SourceReference, Element | Text] => [reference, elementDetails.rendered.get(reference)]);
    }
  }

  async commitChildren(documentNode: Element, node: VNode, tree?: Tree) {
    await hydrateChildren(this.childContext(documentNode), node, tree);
  }

}

interface ElementDetails {
  rendered: Map<SourceReference, Element | Text>;
  disconnect: Map<SourceReference, (documentNode: Element | Text) => void | Promise<void>>;
}

function createDocumentNodeDetails(): ElementDetails {
  return {
    rendered: new Map<SourceReference, Element | Text>(),
    disconnect: new Map<SourceReference, (documentNode: Element | Text) => (void | Promise<void>)>()
  };
}

function isHydrateOptions(options?: object): options is { hydrate: VContext["hydrate"] } {
  function isHydrateOptionsLike(options: unknown): options is { hydrate: unknown } {
    return !!options;
  }
  return isHydrateOptionsLike(options) && typeof options.hydrate === "function";
}
