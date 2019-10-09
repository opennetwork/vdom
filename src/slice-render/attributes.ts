import { HydratedDOMNativeVNode } from "../native";
import { EXPERIMENT_attributeMode, EXPERIMENT_attributes } from "../experiments";

export function setAttributes(node: HydratedDOMNativeVNode, documentNode: Element) {
  const attributes = node.options[EXPERIMENT_attributes];
  if (!attributes) {
    return;
  }
  const attributeMode = node.options[EXPERIMENT_attributeMode] || "exact";

  const keys = Array.isArray(attributes) ? attributes : Object.keys(attributes);

  if (attributeMode === "remove") {
    keys.forEach(key => documentNode.removeAttribute(key));
    return;
  }

  if (Array.isArray(attributes)) {
    throw new Error("Expected object for attributes when using set or exact (default)");
  }

  const lowerKeys = keys.map(key => key.toLowerCase());

  const duplicates = lowerKeys.filter(
    (value, index, array) => {
      const before = array.slice(0, index);
      return before.includes(value);
    }
  );

  if (duplicates.length) {
    throw new Error(`Duplicate keys found for ${duplicates.join(", ")}, this will lead to unexpected behaviour, and is not supported`);
  }

  // Don't use lower keys here as we need to access attributes
  keys.forEach(key => {
    documentNode.setAttribute(key, attributes[key]);
  });

  if (attributeMode !== "exact") {
    return;
  }

  const attributesLength = documentNode.attributes.length;

  // Assume we set all of these attributes, and don't need to check further if there
  if (attributesLength === keys.length) {
    return;
  }

  const toRemove = [];

  for (let attributeIndex = 0; attributeIndex < attributesLength; attributeIndex += 1) {
    const attribute = documentNode.attributes.item(attributeIndex);
    if (lowerKeys.includes(attribute.name)) {
      continue;
    }
    toRemove.push(attribute.name);
  }

  toRemove.forEach(key => documentNode.removeAttribute(key));

}
