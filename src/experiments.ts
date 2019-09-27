import { mutate } from "@opennetwork/vnode-fragment";
import { VNode } from "@opennetwork/vnode";
import { asyncIterable } from "iterable";
import { DOMNativeVNodeOptions } from "./native";

export const EXPERIMENT_onAttached = Symbol("onAttached");
export const EXPERIMENT_getDocumentNode = Symbol("getDocumentNode");
export const EXPERIMENT_attributeMode = Symbol("attributeMode");
export const EXPERIMENT_attributes = Symbol("attributes");

function isAttributes(options: object): options is { attributes: Record<string, string> } {
  function isAttributesLike(options: object): options is { attributes?: unknown } {
    return !!options;
  }
  return (
    isAttributesLike(options) &&
    typeof options.attributes === "object"
  );
}

function isAttributesMode(options: object): options is { attributeMode: "set" | "remove" | "exact" } {
  function isAttributeModeLike(options: object): options is { attributeMode?: unknown } {
    return !!options;
  }
  return (
    isAttributeModeLike(options) &&
    (
      options.attributeMode === "set" ||
      options.attributeMode === "remove" ||
      options.attributeMode === "exact"
    )
  );
}

function isOnAttached(options: object): options is { onAttached: DOMNativeVNodeOptions[typeof EXPERIMENT_onAttached] } {
  function isOnAttachedLike(options: object): options is { onAttached?: unknown } {
    return !!options;
  }
  return (
    isOnAttachedLike(options) &&
    typeof options.onAttached === "function"
  );
}

function isGetDocumentNode(options: object): options is { getDocumentNode: DOMNativeVNodeOptions[typeof EXPERIMENT_getDocumentNode] } {
  function isGetDocumentNodeLike(options: object): options is { getDocumentNode?: unknown } {
    return !!options;
  }
  return (
    isGetDocumentNodeLike(options) &&
    typeof options.getDocumentNode === "function"
  );
}

function isExperimental(options: object): boolean {
  function isExperimentalLike(options: object): options is { [EXPERIMENT_attributes]?: unknown, [EXPERIMENT_attributeMode]?: unknown, [EXPERIMENT_onAttached]?: unknown, [EXPERIMENT_getDocumentNode]?: unknown } {
    return !!options;
  }
  return !!(
    isExperimentalLike(options) &&
    (
      options[EXPERIMENT_attributeMode] ||
      options[EXPERIMENT_attributes] ||
      options[EXPERIMENT_getDocumentNode] ||
      options[EXPERIMENT_onAttached]
    )
  );
}

export function Experiments(options: unknown, children: VNode): VNode {
  return {
    ...mutate(
      (node): node is (VNode & { options: object }) => !!(node && node.options) && !isExperimental(node.options),
      node => {
        const options = { ...node.options };
        if (isAttributes(options)) {
          Object.defineProperty(
            options,
            EXPERIMENT_attributes,
            {
              value: options.attributes
            }
          );
        }
        if (isAttributesMode(options)) {
          Object.defineProperty(
            options,
            EXPERIMENT_attributeMode,
            {
              value: options.attributeMode
            }
          );
        }
        if (isOnAttached(options)) {
          Object.defineProperty(
            options,
            EXPERIMENT_onAttached,
            {
              value: options.onAttached
            }
          );
        }
        if (isGetDocumentNode(options)) {
          Object.defineProperty(
            options,
            EXPERIMENT_getDocumentNode,
            {
              value: options.getDocumentNode
            }
          );
        }
        console.log(options, node);
        return {
          ...node,
          options
        };
      }
    ),
    children: asyncIterable([
      asyncIterable([
        children
      ])
    ])
  };
}
