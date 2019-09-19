import { ElementFactory, elementFactory } from "./element";
import { Fragment, SourceReference, Tree, VNode } from "@opennetwork/vnode";
import {
  asyncExtendedIterable, asyncHooks,
  asyncIterable, asyncIterator,
  extendedIterable,
  isPromise,
  source,
  TransientAsyncIteratorSource
} from "iterable";

function isText(node: HTMLElement | Text): node is Text {
  return !!(node && node.nodeType === node.TEXT_NODE);
}

export async function render(vnode: AsyncIterable<VNode>, root: Node & ParentNode, factory?: ElementFactory, tree?: Tree, maximumDepth: number = 10, childIndex: number = 0): Promise<void> {
  for await (const node of produce(vnode, root, factory, tree, maximumDepth)) {
    console.log({ node });
    if (node.nodeType === node.DOCUMENT_FRAGMENT_NODE) {
      // If we have a fragment, then we want to be able to append to whatever index we're at
      // this should only happen top level, as once we have children we will flatten out our fragments
      while (root.childNodes.length > childIndex) {
        root.removeChild(root.lastChild);
      }
      root.appendChild(node);
    } else {
      if (root.childNodes.length) {
        if (root.childNodes.length < (childIndex + 1)) {
          throw new Error("Expected stable length of children nodes, please ensure if using an index to only use over 0 if there has been a previous render with the exact same, or larger, children length");
        }
        const currentChild = root.childNodes.item(childIndex);
        if (currentChild === node) {
          continue; // No need, already there
        }
        root.replaceChild(node, currentChild);
      } else {
        root.appendChild(node);
      }
    }
    console.log("Next loop", root.ownerDocument.body.outerHTML);
  }
}

async function *produce(vnode: AsyncIterable<VNode>, root: Node & ParentNode, factory?: ElementFactory, tree?: Tree, maximumDepth: number = 10): AsyncIterable<Node> {
  const childrenUpdates = new Map<SourceReference, [TransientAsyncIteratorSource<VNode>, AsyncIterator<Node>]>();

  let error: Error & {
    vnode?: AsyncIterable<VNode>,
    root?: Node & ParentNode,
    errors?: any[]
  } = undefined;

  type CycleDescriptor = [HTMLElement | Text | undefined, VNode, VNode[], AsyncIterator<Node>[]];

  try {
    let currentVNode: VNode = undefined,
      currentDocumentNode: HTMLElement | Text = undefined;
    for await (const nextVNode of vnode) {
      console.log({ nextVNode });

      if (error) {
        break;
      }

      const previousVNode = currentVNode;
      const previousDocumentNode = currentDocumentNode;

      currentVNode = nextVNode;

      if (nextVNode.reference === Fragment) {
        currentDocumentNode = undefined;
      } else {
        currentDocumentNode = await elementFactory(root, nextVNode, factory, previousVNode, previousDocumentNode);
      }

      console.log({ currentDocumentNode });

      if (isText(currentDocumentNode)) {
        yield currentDocumentNode;
        continue;
      }

      for await (const fragment of stageChildren(nextVNode.children)) {
        console.log({ fragment });
        if (!currentDocumentNode) {
          yield fragment;
          continue;
        }

        const fragmentLength = fragment.childNodes.length;

        if (currentDocumentNode.childNodes.length) {
          // Take a copy as we will be removing nodes as we add them to the DOM
          const childNodes: Node[] = [];
          fragment.childNodes.forEach(node => childNodes.push(node));

          childNodes.forEach(
            (node, index) => {
              // If we don't yet have a child at that index, append, else lets replace
              if (currentDocumentNode.childNodes.length > index) {
                const currentNode = currentDocumentNode.childNodes.item(index);
                if (currentNode === node) {
                  return;
                }
                currentDocumentNode.replaceChild(node, currentNode);
              } else {
                currentDocumentNode.appendChild(node);
              }
            }
          );
        } else if (fragmentLength) {
          // We are free to append our entire fragment
          currentDocumentNode.appendChild(fragment);
        }

        while (currentDocumentNode.childNodes.length > fragmentLength) {
          currentDocumentNode.removeChild(currentDocumentNode.lastChild);
        }

        yield currentDocumentNode;
      }
    }
  } catch (anyError) {
    appendError("Root cycle error", anyError);
  } finally {
    // Ensure we are closed
    extendedIterable(childrenUpdates.values())
      .map(updater => updater[0])
      .forEach(source => source.close());

    // Ensure these are never lost
    extendedIterable(childrenUpdates.values())
      .map(updater => updater[0])
      .filter(source => !!source.error)
      .forEach(source => appendError("Child update error", source.error));
  }

  if (error) {
    throw error;
  }

  type Updater = [TransientAsyncIteratorSource<VNode>, AsyncIterator<Node>];

  async function* stageChildren(children?: AsyncIterable<AsyncIterable<VNode>>): AsyncIterable<DocumentFragment> {

    if (!children) {
      return yield root.ownerDocument.createDocumentFragment();
    }

    const childrenIterator: AsyncIterator<AsyncIterable<VNode>, AsyncIterable<VNode>> = children[Symbol.asyncIterator]();
    let nextChildren = await childrenIterator.next();

    if (nextChildren.done) {
      return yield root.ownerDocument.createDocumentFragment();
    }

    while (!nextChildren.done && !error) {
      do {
        const children = await asyncExtendedIterable(nextChildren.value)
          .toArray();

        const [updatingChildren, updatingChildrenUpdates] = await updatingChildrenSetup(children);

        const sources: AsyncIterator<Node>[] = children.map(
          (child): AsyncIterator<Node> => {
            if (!child) {
              return asyncIterator([]);
            }
            const updatingIndex = updatingChildren.indexOf(child);
            if (updatingIndex !== -1) {
              return updatingChildrenUpdates[updatingIndex][1];
            }
            if (child.reference !== Fragment) {
              throw new Error("Didn't expect no updates for non fragment");
            }
            return asyncExtendedIterable(child.children).flatMap(async update => {
              return produce(update, root, factory, tree, maximumDepth);
            })[Symbol.asyncIterator]();
          }
        );

        yield* stageUpdaters(sources);
      } while (false);

      nextChildren = await childrenIterator.next();
    }

  }

  async function *stageUpdaters(updaters: AsyncIterator<Node>[]): AsyncIterable<DocumentFragment> {
    const results: Node[][] = updaters.map(() => undefined);

    type PromiseResult = [number, IteratorResult<Node, Node>];

    const remainingChildrenProducerPromises = updaters.map((updater, index) => iterate(index, updater));
    let filteredRemainingChildrenProducerPromises = remainingChildrenProducerPromises;

    console.log(filteredRemainingChildrenProducerPromises);

    try {
      while (filteredRemainingChildrenProducerPromises.length) {
        console.log(filteredRemainingChildrenProducerPromises);
        const next = await getNextIterations();
        console.log(next);
        applyNext(next);
        const fragment = await getNextFragment();
        filteredRemainingChildrenProducerPromises = remainingChildrenProducerPromises.filter(value => value);
        yield fragment;
      }
    } finally {
      await settlePromises(filteredRemainingChildrenProducerPromises);
    }

    function applyNext(next: PromiseResult[]) {
      next.forEach(
        ([index, result]) => {
          if (result.done) {
            remainingChildrenProducerPromises[index] = undefined;
          } else {
            if (!result.value) {
              results[index] = undefined;
            } else {
              if (result.value.nodeType === root.DOCUMENT_FRAGMENT_NODE) {
                const childNodes: Node[] = [];
                result.value.childNodes.forEach(node => childNodes.push(node));
                results[index] = childNodes;
              } else {
                results[index] = [result.value];
              }
            }
            remainingChildrenProducerPromises[index] = updaters[index].next().then((result): PromiseResult => [index, result]);
          }
        }
      );
    }

    async function getNextFragment(): Promise<DocumentFragment> {
      const fragment = root.ownerDocument.createDocumentFragment();
      results
        .filter(group => group)
        .forEach(group => {
          group
            .filter(node => node)
            .forEach(node => fragment.appendChild(node));
        });
      return fragment;
    }

    function getNextIterations(): Promise<PromiseResult[]> {
      return Promise.race([
        Promise.all(filteredRemainingChildrenProducerPromises),
        Promise.race(
          filteredRemainingChildrenProducerPromises.map(promise => promise.then(result => [result]))
        )
      ]);
    }

    function iterate(index: number, updator: AsyncIterator<Node>): Promise<PromiseResult> {
      return updator.next().then(result => [index, result]);
    }
  }

  async function updatingChildrenSetup(children: VNode[]): Promise<[VNode[], Updater[]]> {
    const updatingChildren: VNode[] = children
      .filter(child => child && child.reference !== Fragment);

    const updatingChildrenUpdates: Updater[] = updatingChildren
      .map(
        child => {
          let updater = childrenUpdates.get(child.reference);
          if (updater) {
            return updater;
          }
          const target = source<VNode>();
          // This forces the target to hold onto values
          const targetIterator = target[Symbol.asyncIterator]();
          const produceSource = source(async () => {
            const next = await targetIterator.next();
            if (next.done) {
              produceSource.close();
              return undefined;
            }
            return next.value;
          });
          const iterator = produce(produceSource, root, factory, tree, maximumDepth)[Symbol.asyncIterator]();
          updater = [target, iterator];
          childrenUpdates.set(child.reference, updater);
          return updater;
        }
      );

    // Close off old updates
    closeChildren(
      extendedIterable(childrenUpdates.keys())
        .filter(key => updatingChildren.findIndex(child => child.reference === key) === -1)
    );

    // Add our current children to our updates
    updatingChildren
      .forEach((child, index) => updatingChildrenUpdates[index][0].push(child));

    return [updatingChildren, updatingChildrenUpdates];
  }

  function appendError(message: string, givenError: unknown) {
    console.warn(message, givenError);
    error = error || new Error(`${message}: ${givenError}`);
    error.errors = error.errors || [];
    error.errors.push(givenError);
    error.root = root;
    error.vnode = vnode;
  }

  function closeChildren(children: Iterable<SourceReference>) {
    extendedIterable(children).forEach(key => {
      const updater = childrenUpdates.get(key);
      if (updater) {
        updater[0].close();
      }
      childrenUpdates.delete(key);
    });
  }

  async function settlePromises(promises: Promise<unknown>[]): Promise<void> {
    interface PromiseDescriptor {
      promise?: Promise<unknown>;
      error?: unknown;
    }

    const withDescriptions = promises
      .filter(promise => isPromise(promise))
      .map((promise): Promise<PromiseDescriptor> => promise
        .then(
          (): PromiseDescriptor => ({ promise }),
          (error): PromiseDescriptor => ({ promise, error })
        )
      );

    const result: PromiseDescriptor = await Promise.race([
      Promise.all(promises).then(() => undefined),
      Promise.race(withDescriptions)
    ]);

    if (!result) {
      return;
    }

    if (result.error) {
      appendError("Nested promise error", result.error);
    }

    return settlePromises(
      promises
        .filter(promise => isPromise(promise) && result.promise !== promise)
    );
  }

}
