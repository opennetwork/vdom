import { Fragment, FragmentVNode, isFragmentVNode, isVNode, VNode } from "@opennetwork/vnode";
import { directive, noChange, nothing, Part, render } from "lit-html";
import { produce } from "../produce";
import { HydratedDOMNativeVNode, isHydratedDOMNativeVNode } from "../native";
import { asyncExtendedIterable, isPromise } from "iterable";
import { asyncReplace } from "lit-html/directives/async-replace";
import { asyncAppend } from "lit-html/directives/async-append";
import { getDocumentNode, isElement } from "../document-node";
import { setAttributes } from "../attributes";
import { EXPERIMENT_onBeforeRender } from "../experiments";

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
  return wrapAsyncDirective(asyncReplace, asyncContext, undefined, { node: produced, from: "asyncReplace" })(
    asyncExtendedIterable(produced.children)
      .map(
        async children => {
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
        }
      )
  );
}

function node(root: Element, node: HydratedDOMNativeVNode, context: AsyncContext, documentNodes: DocumentNodeMap): object {
  return wrapAsyncDirective(directive(() => part => run(part)), context)();

  async function run(part: Part): Promise<Element | Text> {
    const documentNode = await getNode();

    if (isElement(documentNode)) {
      // Set attributes here, this will mean by the time we get to commit, it will change the attributes
      //
      // If this isn't the first time this document node was rendered, it will be changing a live DOM node
      setAttributes(node, documentNode);
    }

    if (node.options[EXPERIMENT_onBeforeRender]) {
      // This happens _before_ mount, it only provides a way
      const result = node.options[EXPERIMENT_onBeforeRender](documentNode);
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
