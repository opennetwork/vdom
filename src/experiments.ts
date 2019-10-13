import { DOMNativeVNodeOptions } from "./native";

export const EXPERIMENT_onBeforeRender = Symbol("onBeforeRender");
export const EXPERIMENT_getDocumentNode = Symbol("getDocumentNode");
export const EXPERIMENT_attributes = Symbol("attributes");

export function isAttributes(options: object): options is { attributes: Record<string, string> } {
  function isAttributesLike(options: object): options is { attributes?: unknown } {
    return !!options;
  }
  return (
    isAttributesLike(options) &&
    typeof options.attributes === "object"
  );
}

export function isAttributesExperiment(options: object): options is { [EXPERIMENT_attributes]: Record<string, string> } {
  function isAttributesLike(options: object): options is { [EXPERIMENT_attributes]?: unknown } {
    return !!options;
  }
  return (
    isAttributesLike(options) &&
    typeof options[EXPERIMENT_attributes] === "object"
  );
}

export function isOnBeforeRender(options: object): options is { onBeforeRender: DOMNativeVNodeOptions[typeof EXPERIMENT_onBeforeRender] } {
  function isOnBeforeRenderLike(options: object): options is { onBeforeRender?: unknown } {
    return !!options;
  }
  return (
    isOnBeforeRenderLike(options) &&
    typeof options.onBeforeRender === "function"
  );
}

export function isOnBeforeRenderExperiment(options: object): options is { [EXPERIMENT_onBeforeRender]: DOMNativeVNodeOptions[typeof EXPERIMENT_onBeforeRender] } {
  function isOnBeforeRenderLike(options: object): options is { [EXPERIMENT_onBeforeRender]?: unknown } {
    return !!options;
  }
  return (
    isOnBeforeRenderLike(options) &&
    typeof options[EXPERIMENT_onBeforeRender] === "function"
  );
}

export function isGetDocumentNode(options: object): options is { getDocumentNode: DOMNativeVNodeOptions[typeof EXPERIMENT_getDocumentNode] } {
  function isGetDocumentNodeLike(options: object): options is { getDocumentNode?: unknown } {
    return !!options;
  }
  return (
    isGetDocumentNodeLike(options) &&
    typeof options.getDocumentNode === "function"
  );
}

export function isGetDocumentNodeExperiment(options: object): options is { [EXPERIMENT_getDocumentNode]: DOMNativeVNodeOptions[typeof EXPERIMENT_getDocumentNode] } {
  function isGetDocumentNodeLike(options: object): options is { [EXPERIMENT_getDocumentNode]?: unknown } {
    return !!options;
  }
  return (
    isGetDocumentNodeLike(options) &&
    typeof options[EXPERIMENT_getDocumentNode] === "function"
  );
}

export function isExperimental(options: object): boolean {
  function isExperimentalLike(options: object): options is { [EXPERIMENT_attributes]?: DOMNativeVNodeOptions[typeof EXPERIMENT_attributes], [EXPERIMENT_onBeforeRender]?: DOMNativeVNodeOptions[typeof EXPERIMENT_onBeforeRender], [EXPERIMENT_getDocumentNode]?: DOMNativeVNodeOptions[typeof EXPERIMENT_getDocumentNode] } {
    return !!options;
  }
  return !!(
    isExperimentalLike(options) &&
    (
      options[EXPERIMENT_attributes] ||
      options[EXPERIMENT_onBeforeRender] ||
      options[EXPERIMENT_getDocumentNode]
    )
  );
}
