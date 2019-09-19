import { ElementFactory, fromVNode, VDOMHydrateEvent } from "./events";
import { Fragment, SourceReference, Tree, VNode } from "@opennetwork/vnode";
import {
  asyncExtendedIterable, asyncHooks,
  asyncIterable,
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
    yield* asyncExtendedIterable(fromVNode(root, vnode, tree, factory))
      .flatMap(event)
      .flatMap(processNextCycle);
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

  async function* processNextCycle(descriptor: CycleDescriptor): AsyncIterable<Node> {
    if (error) {
      throw error;
    }

    const [documentNode, node, children] = descriptor;
    // console.trace(documentNode, node);
    if (!node.children || isText(documentNode) || children.length === 0) {

      // Remove any children from the node
      if (documentNode && documentNode.childNodes.length) {
        while (documentNode.firstChild) {
          documentNode.removeChild(documentNode.firstChild);
        }
      }

      return yield documentNode;
    }

    for await (const fragment of produceChildrenFragments(descriptor)) {
      if (error) {
        return;
      }

      // To debug the fragment, we can peek inside using this
      (function() {
        const childNodes: Node[] = [];
        fragment.childNodes.forEach(node => childNodes.push(node));
        console.log(childNodes);
      })();

      if (!documentNode) {
        yield fragment;

        if (node.reference === Fragment) {
          break;
        } else {
          continue;
        }
      }

      const fragmentLength = fragment.childNodes.length;

      if (documentNode.childNodes.length) {
        // Take a copy as we will be removing nodes as we add them to the DOM
        const childNodes: Node[] = [];
        fragment.childNodes.forEach(node => childNodes.push(node));

        childNodes.forEach(
          (node, index) => {
            console.log(node, index, documentNode.childNodes.length, documentNode.childNodes.length > index);
            // If we don't yet have a child at that index, append, else lets replace
            if (documentNode.childNodes.length > index) {
              const currentNode = documentNode.childNodes.item(index);
              if (currentNode === node) {
                return;
              }
              documentNode.replaceChild(node, currentNode);
            } else {
              documentNode.appendChild(node);
            }
          }
        );
      } else {
        // We are free to append our entire fragment
        documentNode.appendChild(fragment);
      }

      // Remove any excess
      while (documentNode.childNodes.length > fragmentLength) {
        documentNode.removeChild(documentNode.lastChild);
      }

      yield documentNode;

      if (node.reference === Fragment) {
        break;
      }
    }

  }

  // This will produce a new fragment every time there is an update for a child
  async function *produceChildrenFragments([documentNode, node, children, childrenProducers]: CycleDescriptor): AsyncIterable<DocumentFragment> {
    const results: Node[] = children.map(() => undefined);
    const expandedResults: Node[][] = children.map(() => undefined);

    type PromiseResult = [number, IteratorResult<Node, Node>];

    const remainingChildrenProducerPromises: Promise<PromiseResult>[] = childrenProducers
      .map((producer, index): Promise<PromiseResult> => producer.next().then((result): PromiseResult => [index, result]));
    let filteredRemainingChildrenProducerPromises: Promise<PromiseResult>[] = remainingChildrenProducerPromises;

    let previousResults: Node[];

    try {
      do {
        const next: PromiseResult[] = await Promise.race([
          Promise.all(filteredRemainingChildrenProducerPromises),
          Promise.race(
            filteredRemainingChildrenProducerPromises.map(promise => promise.then(result => [result]))
          )
        ]);

        const fragment = root.ownerDocument.createDocumentFragment();

        next.forEach(
          ([index, result]) => {
            if (result.done) {
              remainingChildrenProducerPromises[index] = undefined;
            } else {
              results[index] = result.value;
              if (!result.value) {
                expandedResults[index] = undefined;
              } else {
                if (result.value.nodeType === root.DOCUMENT_FRAGMENT_NODE) {
                  const childNodes: Node[] = [];
                  result.value.childNodes.forEach(node => childNodes.push(node));
                  expandedResults[index] = childNodes;
                } else {
                  expandedResults[index] = [result.value];
                }
              }

              if (children[index].reference === Fragment) {
                remainingChildrenProducerPromises[index] = undefined;
              } else {
                remainingChildrenProducerPromises[index] = childrenProducers[index].next().then((result): PromiseResult => [index, result]);
              }

            }
          }
        );

        expandedResults
          .filter(results => results)
          .forEach(results => {
            results
              .filter(node => node)
              .forEach(node => fragment.appendChild(node));
          });

        filteredRemainingChildrenProducerPromises = remainingChildrenProducerPromises.filter(value => value);

        console.log(filteredRemainingChildrenProducerPromises.length);

        // if (previousResults && results.length === previousResults.length) {
        //   if (results.every((value, index) => value === previousResults[index])) {
        //     console.trace("Skipping yield, same values", results);
        //     continue; // No need to tell anyone about something that hasn't changed
        //   }
        // }

        yield fragment;

        previousResults = results;
      } while (filteredRemainingChildrenProducerPromises.length && !error);
    } catch (e) {
      console.error(e);
    } finally {
      await settlePromises(filteredRemainingChildrenProducerPromises);
    }
  }

  async function *event({ documentNode, node }: VDOMHydrateEvent): AsyncIterable<CycleDescriptor> {
    if (error) {
      // Abort if we got here
      return;
    }
    try {
      if (!node.children || isText(documentNode)) {
        // Nothing else to do, lets add and move on
        return yield [documentNode, node, [], []];
      }

      let currentCycle: CycleDescriptor;

      for await (const nextChildren of node.children) {
        yield currentCycle = await childrenSetup(nextChildren);
      }

      closeChildren(childrenUpdates.keys());

      if (!currentCycle) {
        // We never ran
        yield [documentNode, node, [], []];
      }

      async function childrenSetup(nextChildren: AsyncIterable<VNode>): Promise<CycleDescriptor> {
        const children = await asyncExtendedIterable(nextChildren).toArray();

        // Setup our production
        const updates = children.map(
          (child): [{ push(node: VNode): void }, AsyncIterator<Node, Node>] => {

            // Fragments will never receive a second update
            if (child.reference === Fragment) {
              return [[], asyncHooks<Node, AsyncIterable<Node>, AsyncIterator<Node>>({
                done: () => {
                  console.trace("Fragment complete");
                },
                preYield: () => {
                  console.trace("Fragment pre yield");
                },
                postYield: () => {
                  console.trace("Fragment post yield");
                }
              })(produce(asyncIterable([child]), root, factory, tree, maximumDepth))[Symbol.asyncIterator]()];
            }

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
            if (child.reference !== Fragment) {
              childrenUpdates.set(child.reference, updater);
            }
            return updater;
          }
        );

        // Close off old updates
        closeChildren(
          extendedIterable(childrenUpdates.keys())
            .filter(key => children.findIndex(child => child.reference === key) === -1)
        );

        // Add our current children to our updates
        children
          .filter(child => child.reference !== Fragment)
          .forEach((child, index) => updates[index][0].push(child));

        const nextChildrenProducers = updates.map(updater => updater[1]);
        return [documentNode, node, children, nextChildrenProducers];
      }
    } catch (mainError) {
      appendError(`Main cycle VNode error`, mainError);
    }
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
    console.log(children);
    extendedIterable(children).forEach(key => {
      const updater = childrenUpdates.get(key);
      console.log({ updater }, key);
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
