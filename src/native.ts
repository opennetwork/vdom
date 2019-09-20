import {
  Fragment,
  FragmentVNode,
  isFragmentVNode, isNativeVNode,
  isScalarVNode,
  isSourceReference,
  NativeVNode,
  VNode
} from "@opennetwork/vnode";
import { asyncExtendedIterable, asyncIterable } from "iterable";

export interface DOMNativeVNode extends NativeVNode {
  options: {
    type: "Element" | "Text",
    source: string;
    namespace?: string;
    whenDefined?: boolean;
    is?: string;
  };
}

const HydratedDOMNativeVNodeSymbol = Symbol("Hydrated DOM Native VNode");

export interface HydratedDOMNativeVNode extends DOMNativeVNode {
  hydrated: true;
  children?: AsyncIterable<AsyncIterable<HydratedDOMNativeVNode>>;
  [HydratedDOMNativeVNodeSymbol]: true;
}

export function getHydratedDOMNativeVNode(node: DOMNativeVNode): HydratedDOMNativeVNode {
  const nextNode: DOMNativeVNode & { [HydratedDOMNativeVNodeSymbol]: true } = {
    ...node,
    hydrated: true,
    [HydratedDOMNativeVNodeSymbol]: true
  };
  if (!isHydratedDOMNativeVNode(nextNode)) {
    throw new Error("isHydratedDOMNativeVNode returned false when we expected it to return true");
  }
  return nextNode;
}

export function isHydratedDOMNativeVNode(node: VNode): node is HydratedDOMNativeVNode {
  function isHydratedDOMNativeVNodeLike(node: VNode): node is DOMNativeVNode & { [HydratedDOMNativeVNodeSymbol]?: unknown } {
    return isDOMNativeVNode(node);
  }
  return (
    isHydratedDOMNativeVNodeLike(node) &&
    node[HydratedDOMNativeVNodeSymbol] === true
  );
}

export function isDOMNativeVNode(node: VNode): node is DOMNativeVNode {
  function isDOMNativeVNodeLike(node: VNode): node is NativeVNode & { options?: Partial<DOMNativeVNode["options"]> } {
    return isNativeVNode(node);
  }
  return (
    isDOMNativeVNodeLike(node) &&
    !!node.options &&
    typeof node.options.type === "string" &&
    (
      node.options.type === "Element" ||
      node.options.type === "Text"
    ) &&
    typeof node.options.source === "string" &&
    (
      !node.options.whenDefined ||
      typeof node.options.whenDefined === "boolean"
    ) &&
    (
      !node.options.is ||
      typeof node.options.is === "string"
    ) &&
    (
      !node.options.namespace ||
      typeof node.options.namespace === "string"
    )
  );
}

export function isNativeCompatible(vnode: VNode): boolean {
  return !!getNativeOptions(vnode);
}

function getNativeOptions(vnode: VNode): DOMNativeVNode["options"] {
  if (isFragmentVNode(vnode)) {
    return undefined;
  }

  // Everything but a symbol can be a node, if you want to reference a symbol for a node, use a custom factory
  if (typeof vnode.source === "symbol" || !isSourceReference(vnode.source)) {
    return undefined;
  }

  // If we have no given options, then we have a text node
  if (isScalarVNode(vnode) && !vnode.options && typeof vnode.source !== "symbol") {
    return {
      type: "Text",
      source: String(vnode.source)
    };
  }

  // We can only create elements from string sources
  if (typeof vnode.source !== "string") {
    return undefined;
  }

  return {
    type: "Element",
    source: vnode.source,
    whenDefined: isWhenDefined(vnode.options),
    is: isIsOptions(vnode.options) ? vnode.options.is : undefined,
    namespace: isNamespace(vnode.options) ? vnode.options.namespace : undefined
  };
}

export async function *native(options: unknown, children: VNode): AsyncIterable<VNode> {
  const nativeOptions = getNativeOptions(children);
  if (!nativeOptions) {
    yield children;
  } else {
    yield {
      reference: Symbol("DOM Native"),
      native: true,
      options: nativeOptions
    };
  }
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

function isNamespace(options: unknown): options is { namespace: string } {
  function isNamespaceLike(options: unknown): options is { namespace?: unknown } {
    return !!options;
  }
  return (
    isNamespaceLike(options) &&
    typeof options.namespace === "string"
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
