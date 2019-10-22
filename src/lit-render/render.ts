import { Fragment, FragmentVNode, isFragmentVNode, isVNode, VNode } from "@opennetwork/vnode";
import { directive, noChange, nothing, Part, render, NodePart } from "lit-html";
import { produce } from "../produce";
import { HydratedDOMNativeVNode, isHydratedDOMNativeVNode } from "../native";
import { asyncExtendedIterable, isPromise } from "iterable";
import { asyncAppend } from "lit-html/directives/async-append";
import { getDocumentNode, isElement, isExpectedNode, isText } from "../document-node";
import { setAttributes } from "../attributes";

interface WithPromiseContext {
  context: PromiseContext;
  within: PromiseContext[];
  originalError: unknown;
}

function isWithPromiseContext(value: unknown): value is WithPromiseContext {
  function isWithPromiseContextLike(value: unknown): value is Partial<WithPromiseContext> {
    return !!value;
  }
  return !!(
    isWithPromiseContextLike(value) &&
    value.context &&
    Array.isArray(value.within)
  );
}

interface PromiseContext {
  node?: VNode;
  from?: string;
}

class AsyncContext {
  private promises: Promise<unknown>[] = [];

  pushPromise(promise: Promise<unknown>, context?: PromiseContext) {
    const newPromise = !context ? promise : promise.catch(error => {
      if (isWithPromiseContext(error)) {
        // Re-throw, it has the original info
        error.within.push(context);
        throw error;
      }
      const newError: Error & Partial<WithPromiseContext> = new Error(error);
      newError.context = context;
      newError.originalError = error;
      newError.within = [];
      throw newError;
    });

    this.promises.push(newPromise);
    // Catch unhandled errors, we _will_ grab these
    newPromise.catch(() => {});
  }

  async flush(): Promise<void> {
    do {
      const currentPromises = this.promises.slice();
      await Promise.all(currentPromises);
      this.promises = this.promises.filter(promise => !currentPromises.includes(promise));
    } while (this.promises.length);
  }
}

export async function litRender(initialNode: VNode, container: Element) {
  if (!initialNode) {
    return;
  }

  const asyncContext = new AsyncContext();
  const produced = produce(initialNode);
  const documentNodes: DocumentNodeMap = new WeakMap();

  if (isFragmentVNode(produced)) {
    render(fragment(container, produced, asyncContext, documentNodes), container);
  } else if (isHydratedDOMNativeVNode(produced)) {
    render(node(container, produced, asyncContext, documentNodes), container);
  }

  await asyncContext.flush();
}


interface DocumentNodeMap extends WeakMap<VNode, Element | Text> { }

function fragment(container: Element, produced: FragmentVNode, asyncContext: AsyncContext, documentNodes: DocumentNodeMap): object {
  let previousPromise: Promise<unknown> = undefined;
  return asyncReplace(
    produced.children,
    async (children: AsyncIterable<VNode>, index, asyncContext) => {
      if (previousPromise) {
        await previousPromise;
        previousPromise = undefined;
      }
      return wrapAsyncDirective(asyncAppend, asyncContext, nextPromise => previousPromise = nextPromise, { node: produced, from: "asyncAppend" })(
        children,
        child => {
          if (!isVNode(child)) {
            return nothing;
          }
          if (isFragmentVNode(child)) {
            return fragment(container, child, asyncContext, documentNodes);
          } else if (isHydratedDOMNativeVNode(child)) {
            return node(container, child, asyncContext, documentNodes);
          } else {
            return nothing;
          }
        }
      );
    },
    asyncContext
  );
}

function node(root: Element, node: HydratedDOMNativeVNode, context: AsyncContext, documentNodes: DocumentNodeMap): object {
  return wrapAsyncDirective(directive(() => part => run(part)), context)();

  async function run(part: Part): Promise<Element | Text> {
    let documentNode = await getNode();

    if (part.value && (isElement(part.value) || isText(part.value)) && isExpectedNode(node, part.value)) {
      documentNode = part.value;
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

    if (!isElement(documentNode) || !node.children) {
      return;
    }

    context.pushPromise(litRender(
      { reference: Fragment, children: node.children },
      documentNode
    ), { node, from: "child render" });
  }

  async function getNode() {
    // Node is checked directly, but it needs to be in the global scope for this to work
    // https://github.com/Polymer/lit-html/blob/master/src/lib/parts.ts#L310
    const currentDocumentNode = documentNodes.get(node);
    if (currentDocumentNode) {
      // We already had one for this object, so retain and use again
      return currentDocumentNode;
    }
    const documentNode = await getDocumentNode(root, node);
    documentNodes.set(node, documentNode);
    return documentNode;
  }
}

function wrapAsyncDirective<Args extends any[]>(fn: (...args: Args) => (part: Part) => unknown, context: AsyncContext, onPromise?: (promise: Promise<unknown>) => void, promiseContext?: PromiseContext) {
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
  <T>(value: AsyncIterable<T>, mapper: (v: T, index: number, context: AsyncContext) => unknown, givenContext: AsyncContext) => (part: Part) => {
    givenContext.pushPromise(run());

    async function run() {
      if (!(part instanceof NodePart)) {
        throw new Error("asyncReplace can only be used in text bindings");
      }

      // If we've already set up this particular iterable, we don't need
      // to do anything.
      if (value === part.value) {
        return;
      }

      const context = new AsyncContext();

      // We nest a new part to keep track of previous item values separately
      // of the iterable as a value itself.
      const itemPart = new NodePart(part.options);
      part.value = value;

      let i = 0;

      for await (let v of value) {
        // Check to make sure that value is the still the current value of
        // the part, and if not bail because a new value owns this part
        if (part.value !== value) {
          break;
        }

        // When we get the first value, clear the part. This let's the
        // previous value display until we can replace it.
        if (i === 0) {
          part.clear();
          itemPart.appendIntoPart(part);
        }

        if (mapper !== undefined) {
          v = await mapper(v, i, context) as T;
        }

        itemPart.setValue(v);
        itemPart.commit();
        i++;

        // Wait for this context to be ready for the next render
        await context.flush();
      }
    }
  }
);
