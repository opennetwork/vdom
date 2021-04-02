import { createVNode, Source, VNode, VNodeRepresentationSource, Fragment } from "@opennetwork/vnode";
import {
  isAttributesOptions,
  isGetDocumentNodeOptions,
  isNativeOptions,
  isOnBeforeRenderOptions,
  NativeOptions
} from "./options";


export function h<O extends object>(source: Source<O>, options?: O, ...children: VNodeRepresentationSource[]): VNode {
  if (source === "fragment") {
    return h(Fragment, options, ...children);
  }

  if (typeof source === "string" && (!options || !isNativeOptions(options))) {
    // Please if you have a solution to do this without any, please let me know
    const resultingOptions: Partial<NativeOptions> = {
      type: "Element",
      attributes: {},
    };

    const toJSON = () => ({
      attributes: resultingOptions.attributes
    });

    Object.defineProperty(resultingOptions, "toJSON", {
      value: toJSON,
      enumerable: false
    });

    let remainingOptions: object = options || {};

    if (isGetDocumentNodeOptions(remainingOptions)) {
      const { getDocumentNode, ...nextRemainingOptions } = remainingOptions;
      remainingOptions = nextRemainingOptions;
      resultingOptions.getDocumentNode = getDocumentNode;
    }

    if (isOnBeforeRenderOptions(remainingOptions)) {
      const { onBeforeRender, ...nextRemainingOptions } = remainingOptions;
      remainingOptions = nextRemainingOptions;
      resultingOptions.onBeforeRender = onBeforeRender;
    }

    const finalOptions = {
      attributes: remainingOptions
    };

    if (isAttributesOptions(finalOptions)) {
      resultingOptions.attributes = finalOptions.attributes;
    }

    return h(source, resultingOptions, ...children);
  }

  return createVNode(source, options, ...children);
}
