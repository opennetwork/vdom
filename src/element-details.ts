import { SourceReference } from "@opennetwork/vnode";

export interface ElementDetails {
  rendered: Map<SourceReference, Element | Text>;
  disconnect: Map<SourceReference, (documentNode: Element | Text) => void | Promise<void>>;
}

export function createDocumentNodeDetails(): ElementDetails {
  return {
    rendered: new Map<SourceReference, Element | Text>(),
    disconnect: new Map<SourceReference, (documentNode: Element | Text) => (void | Promise<void>)>()
  };
}

export function assertElementDetails(details: unknown): asserts details is ElementDetails {
  if (!isElementDetails(details)) {
    throw new Error("Expected ElementDetails");
  }
}

function isElementDetails(details: unknown): details is ElementDetails {
  function isElementDetailsLike(details: unknown): details is { rendered: unknown, disconnect: unknown } {
    return !!details;
  }
  return isElementDetailsLike(details) && details.rendered instanceof Map && details.disconnect instanceof Map;
}
