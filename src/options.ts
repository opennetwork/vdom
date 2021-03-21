import { HydratedDOMNativeVNode } from "./native";
import { isFragmentVNode, isScalarVNode, isSourceReference, VNode } from "@opennetwork/vnode";
import { isElement, isText } from "./document-node";

export type DOMNativeVNodeType = "Element" | "Text";
export type DOMNativeVNodeInstance = Element | Text;

export type NativeAttributes = Record<string, string | boolean | number | undefined>;

export interface NativeOptions {
  type: DOMNativeVNodeType;
  is?: string;
  instance?: DOMNativeVNodeInstance;
  whenDefined?: boolean;
  onBeforeRender?: (documentNode: DOMNativeVNodeInstance) => void | Promise<void>;
  onConnected?: (documentNode: DOMNativeVNodeInstance) => void | Promise<void>;
  onRendered?: (documentNode: DOMNativeVNodeInstance) => void | Promise<void>;
  onDisconnected?: (documentNode: DOMNativeVNodeInstance) => void | Promise<void>;
  getDocumentNode?: (root: Element, node: HydratedDOMNativeVNode) => DOMNativeVNodeInstance | Promise<DOMNativeVNodeInstance>;
  attributes?: NativeAttributes;
}

export function isNativeAttributeValue(value: unknown): value is (string | boolean | number | undefined) {
  return (
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  );
}

export function isNativeAttributesObject(attributes: Record<string, unknown>): attributes is NativeAttributes {
  if (!attributes) {
    return false;
  }
  const invalidIndex = Object.keys(attributes).findIndex(key => !isNativeAttributeValue(attributes[key]));
  return invalidIndex === -1;
}

export function isAttributesOptions(options: object): options is { attributes: NativeOptions["attributes"] } {
  function isAttributesLike(options: object): options is { attributes?: Record<string, unknown> } {
    return !!options;
  }
  return (
    isAttributesLike(options) &&
    typeof options.attributes === "object" &&
    isNativeAttributesObject(options.attributes)
  );
}

export function isOnBeforeRenderOptions(options: object): options is { onBeforeRender: NativeOptions["onBeforeRender"] } {
  function isOnBeforeRenderLike(options: object): options is { onBeforeRender?: unknown } {
    return !!options;
  }
  return (
    isOnBeforeRenderLike(options) &&
    typeof options.onBeforeRender === "function"
  );
}

export function isGetDocumentNodeOptions(options: object): options is { getDocumentNode: NativeOptions["getDocumentNode"] } {
  function isGetDocumentNodeLike(options: object): options is { getDocumentNode?: unknown } {
    return !!options;
  }
  return (
    isGetDocumentNodeLike(options) &&
    typeof options.getDocumentNode === "function"
  );
}

export function isNativeOptions(options: object): options is NativeOptions {
  function isNativeOptionsLike(options: object): options is Partial<NativeOptions> {
    return !!options;
  }
  function isAttributesOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { attributes: unknown } {
    return !!(
      !options.attributes ||
      isAttributesOptions(options)
    );
  }
  function isOnBeforeRenderOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { onBeforeRender: unknown } {
    return !!(
      !options.onBeforeRender ||
      isOnBeforeRenderOptions(options)
    );
  }
  function isGetDocumentNodeOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { getDocumentNode: unknown } {
    return !!(
      !options.getDocumentNode ||
      isGetDocumentNodeOptions(options)
    );
  }
  function isIsOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { is: unknown } {
    return !!(
      options.is === undefined ||
      isIsOptions(options)
    );
  }
  function isInstanceOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { instance: unknown } {
    return !!(
      options.instance === undefined ||
      isElement(options.instance) ||
      isText(options.instance)
    );
  }
  function isWhenDefinedOptionsLike(options: Partial<NativeOptions>): options is Partial<NativeOptions> & { whenDefined: unknown } {
    return !!(
      typeof options.whenDefined === "boolean" ||
      options.whenDefined === undefined
    );
  }
  return !!(
    isNativeOptionsLike(options) &&
    typeof options.type === "string" &&
    isAttributesOptionsLike(options) &&
    isOnBeforeRenderOptionsLike(options) &&
    isGetDocumentNodeOptionsLike(options) &&
    isIsOptionsLike(options) &&
    isInstanceOptionsLike(options) &&
    isWhenDefinedOptionsLike(options)
  );
}

export function getNativeOptions(vnode: VNode): NativeOptions {
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
      ...vnode.options,
      type: "Text"
    };
  }

  // We can only create elements from string sources
  if (typeof vnode.source !== "string") {
    return undefined;
  }

  return {
    ...vnode.options,
    type: "Element",
    is: isIsOptions(vnode.options) ? vnode.options.is : undefined
  };
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
