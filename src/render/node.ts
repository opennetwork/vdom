import { DOMRoot, HydratedDOMNativeVNode, DOMNativeVNodeOptions } from "../native";
import { FragmentVNode } from "@opennetwork/vnode";
import { getDocumentNode, isElement, isExpectedNode, isText } from "./document-node";
import { Blocks } from "./blocks";
import { setAttributes } from "./attributes";
import { render } from "./render";
import { EXPERIMENT_onAttached } from "../experiments";

function isOnAttached(options: object): options is { [EXPERIMENT_onAttached]: DOMNativeVNodeOptions[typeof EXPERIMENT_onAttached] } {
  function isOnAttachedLike(options: object): options is { [EXPERIMENT_onAttached]?: unknown } {
    return !!options;
  }
  return (
    isOnAttachedLike(options) &&
    typeof options[EXPERIMENT_onAttached] === "function"
  );
}

export interface NodeOptions {
  node: HydratedDOMNativeVNode;
  parent: DOMRoot;
  fragment: Blocks;
  pointer: symbol;
}

async function onAttached(node: HydratedDOMNativeVNode, documentNode: Element | Text) {
  if (!isOnAttached(node.options)) {
    return;
  }
  await node.options[EXPERIMENT_onAttached](documentNode);
}

export async function mountNode(options: NodeOptions, childrenFragment: FragmentVNode) {
  const documentNode = await getSuitableDocumentNode(options);
  await mount(options, documentNode);

  if (options.node.source === "2") {
    debugger;
  }

  if (isElement(documentNode)) {
    await setAttributes(options.node, documentNode);
  } else if (isText(documentNode)) {
    documentNode.replaceData(0, documentNode.data.length, options.node.source);
  }

  await onAttached(options.node, documentNode);

  if (isElement(documentNode) && childrenFragment) {
    await render(childrenFragment, documentNode);
  }
}

function mount({ node, parent, fragment, pointer }: NodeOptions, documentNode: Element | Text) {
  const [index, currentLength] = fragment.get(pointer);

  if (currentLength === 0) {
    if (parent.childNodes.length >= index) {
      // We have something after us, and we didn't have length before
      const siblingAtIndex = parent.childNodes.item(index);
      // console.log("insertBefore", documentNode, siblingAtIndex);
      parent.insertBefore(documentNode, siblingAtIndex);
    } else if (parent.childNodes.length < index) {
      // If we're appending, the child before should be there
      // If our index is 0, then length will be 0, which is not less, so it would not get here
      // If our index is 1, and the length is 0, then we expected the first item to be there
      throw new Error(`Expected ${index} child${index === 1 ? "" : "ren"}, found ${parent.childNodes.length}`);
    } {
      console.log("Appending", documentNode, index, currentLength);
      // Append to the end, because we're the last one here
      parent.appendChild(documentNode);
    }
  } else {
    const currentAtIndex = parent.childNodes.item(index);
    if (currentAtIndex !== documentNode) {
      console.log("Replacing", documentNode, currentAtIndex);
      parent.replaceChild(documentNode, currentAtIndex);
    }
  }

  // This will remove any old elements that we had for this fragment
  while (fragment.get(pointer)[1] > 1 && documentNode.nextSibling) {
    console.log("Removing", documentNode.nextSibling);
    parent.removeChild(
      documentNode.nextSibling
    );
    fragment.reduce(pointer, 1);
  }

  // console.log("Set 1");
  // console.log(parent.ownerDocument.body.outerHTML);
  fragment.set(pointer, 1);
}

async function getSuitableDocumentNode({ node, parent, fragment, pointer }: NodeOptions): Promise<Element | Text> {
  const [index, length] = fragment.get(pointer);

  if (node.reference === "interval") {
    console.log(node.reference, index, length);
    console.log(fragment);
  }

  if (
    // If we have already got a size, it means that we already rendered something before, so lets se if we can find a matching node in
  // our slice of the fragment
  //
  // For now we will just check the first element at our index, but we could check all the elements in our list for a matching
  // Or we could have some other check that finds this, this would be for a VNode that goes from a fragment to just a VNode
    length >= 1 ||
    // We can pick up on the next node if it is correct and bags it as our own, in this case
    // we will need to pre assign our block
    (fragment.parentSize() < index && parent.childNodes.length > index)
  ) {
    const currentChildDocumentElement = parent.childNodes.item(index);
    // console.log(Array.from(parent.childNodes));
    if (!currentChildDocumentElement) {
      console.log(parent.ownerDocument.body.outerHTML, fragment, length, index, node, pointer, parent.nodeName);
      throw new Error(`Expected node at index ${index}`);
    }
    if (isExpectedNode(node, currentChildDocumentElement)) {
      // If we already had a length, retain it so that we know what we need to remove
      fragment.set(pointer, length || 1);
      return currentChildDocumentElement;
    }
  }

  // In all other cases, create a new node
  return getDocumentNode(parent, node);
}
