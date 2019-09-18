import { ElementFactory, fromVNode, VDOMHydrateEvent } from "./events";
import { Tree, VNode } from "@opennetwork/vnode";
import { asyncExtendedIterable, asyncIterable } from "iterable";

function isText(node: HTMLElement | Text): node is Text {
  return node.nodeType === node.TEXT_NODE;
}

export async function render(vnode: AsyncIterable<VNode>, root: Node & ParentNode, factory?: ElementFactory, tree?: Tree, maximumDepth: number = 10): Promise<void> {
  const events = fromVNode(root, vnode, tree, factory);

  function mount(element: Node) {
    if (element.childNodes.length) {
      const currentFirstChild = element.childNodes.item(0);
      if (currentFirstChild === element) {
        return; // No need, already there
      }
      element.replaceChild(element, currentFirstChild);
    } else {
      element.appendChild(element);
    }
  }

  const eventsIterator = events[Symbol.asyncIterator]();

  let next: IteratorResult<VDOMHydrateEvent> = await eventsIterator.next(),
    nextPromise;

  const childrenPromises = new WeakMap<VNode, Promise<Node>[]>();
  const abandonedChildrenDepth: Promise<unknown>[] = [];
  let abandonedChildren: VNode[] = [];
  let currentChildren: VNode[] = [];

  let error: Error & {
    vnode?: AsyncIterable<VNode>,
    childrenPromises?: WeakMap<VNode, Promise<Node>[]>,
    currentCycle?: IteratorResult<VDOMHydrateEvent>,
    currentChildren?: VNode[],
    abandonedChildren?: VNode[],
    abandonedChildrenDepth?: Promise<unknown>[],
    root?: Node & ParentNode,
    maximumDepth?: number,
    errors?: any[]
  } = undefined;

  try {
    try {
      while (!next.done) {
        // Start the next one so we can see it coming
        nextPromise = eventsIterator.next();

        do {
          const { documentNode, node, previous } = next.value;

          if (!node.children || isText(documentNode)) {
            // Nothing else to do, lets add and move on
            mount(documentNode);
            continue;
          }

          let workingNode: Node = documentNode;
          const childrenIterator = node.children[Symbol.asyncIterator]();

          let nextChildren: IteratorResult<AsyncIterable<VNode>> = await childrenIterator.next(),
            nextChildrenPromise,
            previousCycleAbandonedPromise: Promise<boolean> = Promise.resolve(new Promise(() => {}));

          if (nextChildren.done) {
            // We don't have any children, so we have to append and move on
            mount(documentNode);
            continue;
          }

          while (!nextChildren.done) {
            nextChildrenPromise = childrenIterator.next();

            do {
              // Each child will wait for its previous render
              const childrenSetupPromise = asyncExtendedIterable(nextChildren.value).map((child: VNode) => {
                const previousPromises = childrenPromises.get(child) || [];

                // Remove any promises that are too deep, we will hold onto these promises to catch any errors
                if (previousPromises.length > maximumDepth) {
                  const removedPromises = previousPromises.splice(0, previousPromises.length - maximumDepth);
                  abandonedChildrenDepth.push(...removedPromises);
                  removedPromises.forEach(promise => promise.then(() => {
                    // Remove the promise if we ever complete successfully
                    const index = abandonedChildrenDepth.indexOf(promise);
                    if (index > -1) {
                      abandonedChildrenDepth.splice(index, 1);
                    }
                  }));
                }

                const currentPromise = (async () => {
                  const fragment = root.ownerDocument.createDocumentFragment();
                  // Single update render
                  await render(asyncIterable([child]), fragment, factory, undefined);
                  return fragment;
                })();
                childrenPromises.set(child, previousPromises.concat(currentPromise));
                return child;
              }).toArray();

              const shouldMount = await Promise.race([
                childrenSetupPromise.then(() => true),
                nextChildrenPromise.then(() => false),
                previousCycleAbandonedPromise
              ]);

              if (!shouldMount) {
                continue;
              }

              const previousChildren = currentChildren;
              currentChildren = await childrenSetupPromise;

              abandonedChildren = abandonedChildren
                // New abandoned
                .concat(previousChildren.filter(value => !currentChildren.includes(value)))
                // Previous abandoned
                .filter(value => !currentChildren.includes(value));

              const currentAbandonedChildren = abandonedChildren;

              // This promise is to hold all abandoned children's promises, in case they ever throw an error
              // This promise will never resolve
              previousCycleAbandonedPromise = previousCycleAbandonedPromise
                .then(() => createAbandonedPromise(currentAbandonedChildren))
                // If we ever succeed, ensure the promise will never continue
                .then(() => new Promise(() => {}));

              if (getChildrenPromiseCount() === 0) {
                mount(workingNode);
                continue;
              }

              do {
                const fragment = root.ownerDocument.createDocumentFragment();
                const nodes: Node[] = (
                  await Promise.all(
                    currentChildren.map(
                      // If we have a child with no promise then it could have been unmounted or not wanting mounting yet
                      // The default shows this, however the default will never be used
                      // TODO implementing progressive mounting using this
                      (child): Promise<Node> => (childrenPromises.get(child) || [Promise.resolve(undefined)])[0]
                    )
                  )
                )
                  .filter(node => node);

                if (typeof fragment.append === "function") {
                  fragment.append(...nodes);
                } else {
                  for (const node of nodes) {
                    fragment.appendChild(node);
                  }
                }

                // If we never got to creating children, then we don't need to clone again
                if (workingNode.childNodes.length) {
                  workingNode = workingNode.cloneNode(false);
                }
                workingNode.appendChild(fragment);
                mount(workingNode);
              } while (getChildrenPromiseCount() > 0);

            } while (false);

            nextChildren = await nextChildrenPromise;

            function getChildrenPromiseCount() {
              return currentChildren
                .map(vnode => (childrenPromises.get(vnode) || []).length)
                .reduce((sum, length) => sum + length);
            }
          }
        } while (false);

        next = await nextPromise;
      }
    } catch (mainError) {
      appendError("Main cycle VNode error", mainError);
    } finally {
      // TODO current children settle

      // while (currentChildren.length) {
      //
      //   const settledChildren = await Promise.race([
      //
      //   ]);
      //
      // }

    }
  } finally {
    // Wait for everything to clear, this allows errors to stack as we receive them
    // It is expected for abandonedChildren to decreate in size till there are no more children left
    // meaning that all promises have settled
    let previousLength = abandonedChildren.length,
      cyclesStable = 0;
    while (abandonedChildren.length) {
      if (previousLength === abandonedChildren.length) {
        cyclesStable += 1;
      } else {
        cyclesStable = 0;
        previousLength = abandonedChildren.length;
      }
      // Wait for everything to settle if there are any promises remaining
      try {
        if (cyclesStable > maximumDepth) {
          const stableError: Error & {
            cyclesStable?: number,
            maximumDepth?: number,
            abandonedChildren?: VNode[]
          } = new Error("Abandoned children cycle count has been detected to never end");
          stableError.cyclesStable = cyclesStable;
          stableError.maximumDepth = maximumDepth;
          stableError.abandonedChildren = abandonedChildren;
          appendError(stableError.message, stableError);
        } else {
          await createAbandonedPromise(abandonedChildren);
        }
      } catch (childError) {
        appendError("Nested VNode child error", childError);
      }
    }
  }

  if (error) {
    throw error;
  }

  function appendError(message: string, givenError: unknown) {
    error = error || new Error(`${message}: ${givenError}`);
    error.errors = error.errors || [];
    error.errors.push(givenError);
    error.currentChildren = currentChildren;
    error.maximumDepth = maximumDepth;
    error.root = root;
    error.vnode = vnode;
    error.abandonedChildrenDepth = abandonedChildrenDepth;
    error.childrenPromises = childrenPromises;
    error.currentCycle = next;
    error.abandonedChildren = abandonedChildren;
  }

  // TODO have this reviewed, I have a feeling that a promise _could_ be forgotten where it shouldn't have been
  async function createAbandonedPromise(cycleAbandonedChildren: VNode[]) {
    interface PromiseDescriptor {
      node?: VNode;
      promise?: Promise<unknown>;
      error?: unknown;
    }

    const promises = cycleAbandonedChildren
      .map((node): PromiseDescriptor[] => (childrenPromises.get(node) || []).map(promise => ({ promise, node })))
      .filter(promises => !!promises.length)
      .reduce((all, promises): PromiseDescriptor[] => all.concat(promises), [])
      .map(
        ({ promise, node }) => promise.then(
          (): PromiseDescriptor => ({ node, promise, error: undefined }),
          (error): PromiseDescriptor => ({ node, error, promise })
        )
      );

    const { promise, error, node } = await Promise.race([
      // If we get an error out of any of these, then
      Promise.all(promises).then((): PromiseDescriptor => ({ promise: undefined, error: undefined, node: undefined })),
      // Only if one of the promises produce an error will we return with one of them
      Promise.race(
        promises.map(promise => promise.then((): Promise<PromiseDescriptor> => new Promise(() => {})))
      )
    ]);

    if (error) {
      if (!node) {
        throw new Error("In an unexpected state, we thought we would have a node here");
      }
      // Forget the one with the error
      forgetAbandoned([node]);
    } else if (node || promise) {
      throw new Error("In an unexpected state, didn't think there would be a node or promise here");
    } else {
      // Forget everything
      forgetAbandoned(cycleAbandonedChildren);
    }
  }

  function forgetAbandoned(toForget: VNode[]) {
    // If we get here, we will never receive an error from these
    abandonedChildren = abandonedChildren
      .filter(child => {
        // Always ignore current children
        if (currentChildren.includes(child)) {
          return true;
        }
        return !toForget.includes(child);
      });
  }

}
