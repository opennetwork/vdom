import { VNode } from "@opennetwork/vnode";

export interface DocumentNodeMap extends WeakMap<VNode, Element | Text> { }

export interface LitWithPromiseContext {
  context: LitPromiseContext;
  within: LitPromiseContext[];
  originalError: unknown;
}

export function isLitWithPromiseContext(value: unknown): value is LitWithPromiseContext {
  function isWithPromiseContextLike(value: unknown): value is Partial<LitWithPromiseContext> {
    return !!value;
  }
  return !!(
    isWithPromiseContextLike(value) &&
    value.context &&
    Array.isArray(value.within)
  );
}

export interface LitPromiseContext {
  node?: VNode;
  from?: string;
}

export class LitContext {

  private promises: Promise<unknown>[] = [];
  public documentNodes: DocumentNodeMap = new WeakMap();

  pushPromise(promise: Promise<unknown>, context?: LitPromiseContext) {
    const newPromise = !context ? promise : promise.catch(error => {
      if (isLitWithPromiseContext(error)) {
        // Re-throw, it has the original info
        error.within.push(context);
        throw error;
      }
      const newError: Error & Partial<LitWithPromiseContext> = new Error(error);
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
