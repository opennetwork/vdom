import {
  Fragment,
  isScalarVNode,
  isSourceReference,
  VContextHydrateEvent,
  VNode,
  Tree
} from "@opennetwork/vnode";
import {
  asyncExtendedIterable,
  isPromise
} from "iterable";

export interface VDOMHydrateEvent extends VContextHydrateEvent {
  documentNode?: HTMLElement | Text;
  previous?: VDOMHydrateEvent;
}

export interface ElementFactory {
  (event: VContextHydrateEvent): VDOMHydrateEvent | undefined | Promise<VDOMHydrateEvent | undefined>;
}

export function fromVNode(root: Node & ParentNode, vnode: AsyncIterable<VNode>, tree?: Tree, factory?: ElementFactory): AsyncIterable<VDOMHydrateEvent | undefined> {
  let currentEvent: VDOMHydrateEvent;
  return asyncExtendedIterable(vnode)
    .map(node => ({ node, tree }))
    .map(async event => {
      try {
        currentEvent = await elementFactory(currentEvent, root, event, factory);
        return currentEvent;
      } catch (error) {
        const nextError: Error & { error?: unknown } = new Error("Found error while producing a DOM element from a VNode");
        nextError.error = error;
        throw nextError;
      }
    });
}

function isWhenDefined(options: unknown): options is { whenDefined: true } {
  function isWhenDefinedLike(options: unknown): options is { whenDefined?: unknown } {
    return !!options;
  }
  return (
    isWhenDefinedLike(options) &&
    options.whenDefined === true
  );
}

function isIsOptions(options: unknown): options is { is: string } {
  function isIsOptionsLike(options: unknown): options is { is?: unknown } {
    return !!options;
  }
  return (
    isIsOptionsLike(options) &&
    typeof options.is === "string"
  );
}

function isSimilarVNode(left: VNode, right: VNode): boolean {
  return (
    left &&
    right &&
    left.source === right.source &&
    left.reference === right.reference &&
    (
      (!left.options && !right.options) ||
      (!!left.options && !!right.options)
    ) &&
    (
      (!left.children && !right.children) ||
      (!!left.children && !!right.children)
    )
  );
}

async function elementFactory(currentEvent: VDOMHydrateEvent, root: Node & ParentNode, event: VContextHydrateEvent, factory: ElementFactory | undefined): Promise<VDOMHydrateEvent | undefined> {
  if (event.node.reference === Fragment) {
    return { ...event, documentNode: undefined };
  }
  if (typeof factory === "function") {
    let result = factory(event);
    if (isPromise(result)) {
      result = await result;
    }
    if (result) {
      return result;
    }
  }
  // Everything but a symbol can be a node, if you want to reference a symbol for a node, use a custom factory
  if (typeof event.node.source === "symbol" || !isSourceReference(event.node.source)) {
    return undefined;
  }
  // Retain previous documentNode if the vnode is of similar shape & same reference
  if (currentEvent && currentEvent.documentNode && isSimilarVNode(currentEvent.node, event.node)) {
    return {
      ...event,
      documentNode: currentEvent.documentNode
    };
  }
  const documentNode = await getNode();
  if (!documentNode) {
    return undefined;
  }
  return {
    ...event,
    documentNode,
    previous: currentEvent
  };

  async function getNode(): Promise<HTMLElement | Text> {
    // If we have no given options, then we have a text node
    if (isScalarVNode(event.node) && !event.node.options && typeof event.node.source !== "symbol") {
      return root.ownerDocument.createTextNode(event.node.source.toString());
    }

    // We can only create elements from string sources
    if (typeof event.node.source !== "string") {
      return undefined;
    }

    // If we're wanting to wait, wait, but only if we can
    if (isWhenDefined(event.node.options) && root.ownerDocument.defaultView.customElements && root.ownerDocument.defaultView.customElements.whenDefined) {
      await root.ownerDocument.defaultView.customElements.whenDefined(event.node.source);
    }

    return root.ownerDocument.createElement(event.node.source, isIsOptions(event.node.options) ? { is: event.node.options.is } : undefined);
  }
}
