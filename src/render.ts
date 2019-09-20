import { children, VNode } from "@opennetwork/vnode";
import { produce } from "./produce";
import { asyncExtendedIterable } from "iterable";
import { DOMNativeVNode, HydratedDOMNativeVNode } from "./native";

export type DOMRoot = Node & ParentNode;
export type DOMSourceValue = Text | Element;
export type DOMProduced = AsyncIterable<DOMSourceValue>;

function isText(node: DOMSourceValue): node is Text {
  return node.nodeType === node.TEXT_NODE;
}

export async function render(vnode: AsyncIterable<VNode>, root: DOMRoot, atIndex: number = 0): Promise<void> {
  const production = asyncExtendedIterable(produce(vnode)).map(nodes => {
    return asyncExtendedIterable(nodes)
      .flatMap(node => map(root, node));
  });
  for await (const nodes of production) {
    console.log("BEFORE", root.ownerDocument.body.outerHTML, { nodes });
    await replaceChildren(root, nodes, atIndex);
    console.log("AFTER", root.ownerDocument.body.outerHTML);
  }
  console.log("Finished", production);
}

async function *map(root: DOMRoot, node: HydratedDOMNativeVNode) {
  const documentNode = await getDocumentNode(root, node);

  if (isText(documentNode)) {
    return yield documentNode;
  }

  for await (const children of asyncExtendedIterable(node.children)) {
    for await (const transformed of asyncExtendedIterable(children).map(node => map(root, node))) {
      await replaceChildren(
        documentNode,
        transformed,
        0
      );
      yield documentNode;
    }
  }

  yield documentNode;

}

export async function replaceChildren(documentNode: DOMRoot, nextChildren: DOMProduced, atIndex: number = 0): Promise<void> {

  if (atIndex < 0) {
    throw new Error("Expected index to be equal to or above 0");
  }

  if (atIndex !== 0) {
    const currentLength = documentNode.childNodes.length;
    if (currentLength < atIndex) {
      throw new Error(`When an index is used, all elements beforehand must already exist. Expected elements: ${atIndex}, found elements: ${currentLength}`);
    }
  }

  const previousChildNodes: DOMSourceValue[] = [];
  const nextChildNodes = await asyncExtendedIterable(nextChildren)
    .tap(node => {
      console.log("CHILD", { node });

      const currentExpectedChildNodes = previousChildNodes.slice();

      previousChildNodes.push(node);

      const previousIndex = currentExpectedChildNodes.length - 1;

      if (currentExpectedChildNodes[0]) {
        const previousIndex = currentExpectedChildNodes.length - 1;
        const previousExpectedNode = currentExpectedChildNodes[previousIndex];
        const previousFoundNode = documentNode.childNodes.item(previousIndex + atIndex);
        if (previousExpectedNode !== previousFoundNode) {
          throw new Error("DOM has been tampered with during the render cycle!");
        }
      }

      const currentIndex = previousIndex + 1;
      // We must check every time where we are at
      const length = documentNode.childNodes.length;

      // We're replacing
      if (length > currentIndex) {
        const currentNode = documentNode.childNodes.item(currentIndex + atIndex);
        if (currentNode === node) {
          console.log({ currentNode, node });
          // Already there, so no need to update
          return;
        }
        if (currentNode) {
          documentNode.replaceChild(
            node,
            currentNode
          );
        } else {
          throw new Error(`Expected child at index ${currentIndex + atIndex}`);
        }
      } else {
        // We're appending
        documentNode.appendChild(node);
      }

      console.log("Added", documentNode.ownerDocument.body.outerHTML);
    })
    .toArray();

  console.log({ nextChildNodes });

  while (documentNode.childNodes.length > nextChildNodes.length) {
    documentNode.removeChild(documentNode.lastChild);
  }
}

async function getDocumentNode(root: DOMRoot, node: DOMNativeVNode): Promise<Text | Element> {
  if (node.options.type === "Text") {
    return root.ownerDocument.createTextNode(node.source);
  }
  if (node.options.type !== "Element") {
    throw new Error("type must be Text or Element");
  }
  if (node.options.whenDefined && root.ownerDocument.defaultView.customElements && root.ownerDocument.defaultView.customElements.whenDefined) {
    await root.ownerDocument.defaultView.customElements.whenDefined(node.source);
  }

  if (node.options.namespace) {
    return root.ownerDocument.createElementNS(node.options.namespace, node.source, { is: node.options.is });
  } else {
    return root.ownerDocument.createElement(node.source, { is: node.options.is });
  }
}
