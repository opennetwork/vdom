import { Fragment, FragmentVNode, isFragmentVNode, isVNode, VNode } from "@opennetwork/vnode";
import { directive, noChange, nothing, Part, render, NodePart } from "lit-html";
import { produce } from "../produce";
import { HydratedDOMNativeVNode, isHydratedDOMNativeVNode } from "../native";
import { isPromise } from "iterable";
import { asyncAppend } from "lit-html/directives/async-append";
import { getDocumentNode, isElement, isExpectedNode, isText } from "../document-node";
import { setAttributes } from "../attributes";
import { LitContext, LitPromiseContext } from "./context";

export function litRender(initialNode: VNode, container: Element): Promise<void> {
  if (!initialNode) {
    return Promise.resolve();
  }

  const context = new LitContext();
  const produced = produce(initialNode);

  render(
    node(container, produced, context),
    container
  );

  return context.flush();
}

function fragment(container: Element, produced: FragmentVNode, context: LitContext): object {
  let previousPromise: Promise<unknown> = undefined;
  return asyncReplace(
    produced.children,
    async (children: AsyncIterable<VNode>, context) => {
      if (previousPromise) {
        await previousPromise;
        previousPromise = undefined;
      }
      return wrapAsyncDirective(asyncAppend, context, nextPromise => previousPromise = nextPromise, { node: produced, from: "asyncAppend" })(
        children,
        child => {
          if (!isVNode(child)) {
            return nothing;
          }
          return node(container, child, context);
        }
      );
    },
    context
  );
}

function node(root: Element, node: VNode, context: LitContext): object {
  if (isFragmentVNode(node)) {
    return fragment(root, node, context);
  }

  if (!isHydratedDOMNativeVNode(node)) {
    return nothing;
  }

  return wrapAsyncDirective(directive(() => part => run(node, part)), context)();

  function isPartValueExpectedNode(node: HydratedDOMNativeVNode, part: Part): part is Part & { value: Element | Text } {
    return part.value && (isElement(part.value) || isText(part.value)) && isExpectedNode(node, part.value);
  }

  async function run(node: HydratedDOMNativeVNode, part: Part): Promise<Element | Text> {
    let documentNode: Element | Text;

    // Only if getDocumentNode is not available will be check if it is already correct
    // this is because getDocumentNode can have side-effects of its own before we know about it
    if (!node.options.getDocumentNode && isPartValueExpectedNode(node, part)) {
      documentNode = part.value;
    } else {
      documentNode = await getNode(node);
    }

    if (isElement(documentNode)) {
      // Set attributes here, this will mean by the time we get to commit, it will change the attributes
      //
      // If this isn't the first time this document node was rendered, it will be changing a live DOM node
      setAttributes(node, documentNode);
    }

    if (node.options.onBeforeRender) {
      // This happens _before_ mount, it only provides a way to grab onto that node
      const result = node.options.onBeforeRender(documentNode);
      if (isPromise(result)) {
        await result;
      }
    }

    part.setValue(documentNode);
    part.commit();

    if (node.options.onConnected) {
      const result = node.options.onConnected(documentNode);
      if (isPromise(result)) {
        await result;
      }
    }

    const onRendered = async () => {
      if (node.options.onRendered) {
        const result = node.options.onRendered(documentNode);
        if (isPromise(result)) {
          await result;
        }
      }
    };

    if (isElement(documentNode) && node.children) {
      const promise = litRender(
        { reference: Fragment, children: node.children },
        documentNode
      ).then(onRendered);
      context.pushPromise(promise, { node, from: "child render" });
    } else {
      await onRendered();
    }

    return documentNode;
  }

  async function getNode(node: HydratedDOMNativeVNode) {
    // Node is checked directly, but it needs to be in the global scope for this to work
    // https://github.com/Polymer/lit-html/blob/master/src/lib/parts.ts#L310
    const currentDocumentNode = context.documentNodes.get(node);
    // Only if the parentNode is the current root will we utilise the known element
    if (currentDocumentNode && currentDocumentNode.parentElement === root) {
      // We already had one for this object, so retain and use again
      return currentDocumentNode;
    }
    // Remove while we generate
    context.documentNodes.delete(node);
    const documentNode = await getDocumentNode(root, node);
    context.documentNodes.set(node, documentNode);
    return documentNode;
  }
}

function wrapAsyncDirective<Args extends any[]>(fn: (...args: Args) => (part: Part) => unknown, context: LitContext, onPromise?: (promise: Promise<unknown>) => void, promiseContext?: LitPromiseContext) {
  return directive(
    (...args: Args) => {
      const nextFn = fn(...args);
      return (part: Part) => {
        // Set to noChange, this can be reset by implementation no issues
        part.setValue(noChange);
        const result = nextFn(part);
        if (isPromise(result)) {
          context.pushPromise(result, promiseContext);
          if (onPromise) {
            onPromise(result);
          }
        }
        return result;
      };
    }
  );
}

// This is a near clone of https://github.com/Polymer/lit-html/blob/master/src/directives/async-replace.ts
// However we want to both collect promises, and flush promises after each commit
const asyncReplace = directive(
  <T>(value: AsyncIterable<T>, mapper: (v: T, context: LitContext) => unknown, givenContext: LitContext) => (part: Part) => {
    givenContext.pushPromise(run());

    async function run() {
      if (!(part instanceof NodePart)) {
        throw new Error("Expected NodePart");
      }

      // If we've already set up this particular iterable, we don't need
      // to do anything.
      if (value === part.value) {
        return;
      }

      const context = new LitContext();

      // We nest a new part to keep track of previous item values separately
      // of the iterable as a value itself.
      const itemPart = new NodePart(part.options);
      part.value = value;

      let cleared: boolean = false;

      for await (let v of value) {
        // Check to make sure that value is the still the current value of
        // the part, and if not bail because a new value owns this part
        if (part.value !== value) {
          break;
        }

        // When we get the first value, clear the part. This let's the
        // previous value display until we can replace it.
        if (!cleared) {
          part.clear();
          itemPart.appendIntoPart(part);
          cleared = true;
        }

        if (mapper !== undefined) {
          v = await mapper(v, context) as T;
        }

        itemPart.setValue(v);
        itemPart.commit();

        // Wait for this context to be ready for the next render
        await context.flush();
      }
    }
  }
);
