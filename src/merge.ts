import {
  asyncExtendedIterable,
  asyncIterable,
  AsyncIterableLike, asyncUnion, asyncView,
  extendedIterable, getNext, isAsyncIterable,
  source,
  TransientAsyncIteratorSource
} from "iterable";
import {
  getListAsyncIterable, getListUpdaterAsyncIterable,
  ListAsyncIterable,
  ListUpdaterAsyncIterable
} from "./branded-iterables";

type Produced<SourceValue> = ListAsyncIterable<SourceValue>;
type Producer<SourceValue> = ListUpdaterAsyncIterable<Produced<SourceValue>>;
type Merge<SourceValue> = AsyncIterable<Producer<SourceValue>>;

type ProducedResult<SourceValue> = IteratorResult<Produced<SourceValue>>;
type ProducerResult<SourceValue> = IteratorResult<Producer<SourceValue>>;

type LayerTarget<SourceValue> = ListAsyncIterable<Produced<SourceValue>, TransientAsyncIteratorSource<Produced<SourceValue>>>;

type ProducedResultPromiseValue<SourceValue> = [Producer<SourceValue>, ProducedResult<SourceValue>];
type ProducedResultPromise<SourceValue> = Promise<ProducedResultPromiseValue<SourceValue>>;

type LeftResult<SourceValue> = ProducerResult<SourceValue>;
type RightResult<SourceValue> = ProducedResultPromiseValue<SourceValue>;
type LeftRight<SourceValue> = [LeftResult<SourceValue>, RightResult<SourceValue>];

export class Merger<SourceValue> {

  private producersIterator: AsyncIterator<Producer<SourceValue>>;
  private nextProducerPromise: Promise<ProducerResult<SourceValue>>;

  private readonly producers = new Map<Producer<SourceValue>, AsyncIterator<Produced<SourceValue>>>();
  private readonly producersClosed = new Set<Producer<SourceValue>>();
  private readonly producersUsed = new Set<Producer<SourceValue>>();
  private readonly producerPromises = new Map<Producer<SourceValue>, ProducedResultPromise<SourceValue>>();

  private readonly newLayers: Produced<SourceValue>[] = [];
  private readonly layers: Produced<SourceValue>[] = [];
  private readonly layerProducers = new WeakMap<Produced<SourceValue>, Set<Producer<SourceValue>>>();
  private readonly layerTargets = new Map<Produced<SourceValue>, LayerTarget<SourceValue>>();
  private readonly layerViews = new WeakMap<Produced<SourceValue>, AsyncIterable<SourceValue>>();

  private nextStepPromise: Promise<void>;

  private returnedAnyLayer: boolean = false;

  constructor(toMerge: Merge<SourceValue>) {
    this.producersIterator = toMerge[Symbol.asyncIterator]();
  }

  async close() {
    const iterator = this.producersIterator;
    this.producersIterator = undefined;

    extendedIterable(this.layerTargets.values()).forEach(
      value => value.close()
    );
    this.layerTargets.clear();

    this.producers.clear();
    this.producersClosed.clear();
    this.producersUsed.clear();
    // TODO settle these promises
    this.producerPromises.clear();

    this.returnedAnyLayer = false;

    // TODO close these iterables
    // layerProducers

    // Kill any and all layers
    this.newLayers.splice(0, this.newLayers.length);
    this.layers.splice(0, this.layers.length);

    if (iterator && iterator.return) {
      try {
        await iterator.return();
      } catch (forgottenError) {

      }
    }
  }

  cycle(): Producer<SourceValue> {
    const that = this;

    const next = async (): Promise<Produced<SourceValue>> => {
      await that.nextStep();
      if (this.newLayers.length) {
        this.returnedAnyLayer = true;
        return this.newLayers.shift();
      } else if (that.isPending()) {
        return next();
      } else {
        if (!this.returnedAnyLayer) {
          this.returnedAnyLayer = true;
          return getListAsyncIterable(asyncIterable([]));
        } else {
          await that.close();
          target.close();
          return undefined;
        }
      }
    };

    const target = source(next);

    return getListUpdaterAsyncIterable(target);
  }

  isPending(): boolean {
    return !!(
      this.producersIterator ||
      this.hasPromise() ||
      this.producers.size !== this.producersClosed.size
    );
  }

  hasPromise(): boolean {
    if (this.nextProducerPromise || this.nextStepPromise) {
      return true;
    }
    return extendedIterable(this.producerPromises.values()).some(value => !!value);
  }

  nextStep() {
    const that = this;

    const currentPromise = (this.nextStepPromise || Promise.resolve()).then(doNextStep);

    return this.nextStepPromise = currentPromise;

    async function doNextStep() {
      const nextPromise = that.getNext();
      if (!nextPromise) {
        if (currentPromise === that.nextStepPromise) {
          that.nextStepPromise = undefined;
        }
        return;
      }

      const [left, right] = await nextPromise;

      if (left) {
        that.nextProducer(left);
      }

      if (right) {
        await that.nextProduced(right);
      }

      if (currentPromise === that.nextStepPromise) {
        that.nextStepPromise = undefined;
      }
    }
  }

  getNext(): Promise<LeftRight<SourceValue>> {
    if (!this.nextProducerPromise && this.producersIterator) {
      this.nextProducerPromise = this.producersIterator.next();
    }

    const producerPromises: ProducedResultPromise<SourceValue>[] = this.getProducerPromises();
    const racedProducerPromise: Promise<LeftRight<SourceValue>> = Promise.race(
      producerPromises
        .map(promise => promise.then((result): LeftRight<SourceValue> => [undefined, result]))
    );

    if (!this.nextProducerPromise) {
      return producerPromises.length ? racedProducerPromise : undefined;
    }

    const nextProducerPromise: Promise<LeftRight<SourceValue>> = this.nextProducerPromise
      .then((result): LeftRight<SourceValue> => [result, undefined]);

    if (!producerPromises.length) {
      return nextProducerPromise;
    }

    return Promise.race([
      racedProducerPromise,
      nextProducerPromise
    ]);
  }

  nextProducer(producer: LeftResult<SourceValue>) {
    this.nextProducerPromise = undefined;
    if (producer.done) {
      this.producersIterator = undefined;
    } else {
      this.producers.set(producer.value, producer.value[Symbol.asyncIterator]());
    }
  }

  async nextProduced([producer, result]: ProducedResultPromiseValue<SourceValue>): Promise<void> {
    this.producerPromises.set(producer, undefined);
    if (result.done) {
      this.producersClosed.add(producer);
      this.producerPromises.delete(producer);
      return;
    }

    const targets = await this.getLayerTargets(producer);

    targets.forEach(([layer, target]) => {
      this.layerProducers.get(layer).add(producer);
      target.push(getListAsyncIterable<SourceValue>(asyncExtendedIterable<SourceValue>(result.value).retain()));
    });

    // Lets forget about these layers, as we're moving onto the big leagues
    if (targets.length !== this.layers.length) {
      this.layers.splice(0, this.layers.length - targets.length);
    }
  }

  async getLayerTargets(producer: Producer<SourceValue>): Promise<[Produced<SourceValue>, LayerTarget<SourceValue>][]> {
    const producerArray = extendedIterable(this.producers.keys()).toArray();
    const producerIndex = getProducerIndex(producer);

    const compatibleLayers = this.layers
      .filter(layer => {
        const set = this.layerProducers.get(layer);

        if (set.has(producer)) {
          // If we already have this value in our layer, we don't want it
          // This will go into a new layer
          return false;
        }

        const maxIndex = Math.max(...extendedIterable(set.values()).map(getProducerIndex).toArray());

        if (maxIndex > producerIndex) {
          // If we have a producer that is later in our producers list, then we don't want to insert into it,
          // and instead this will go into a new layer
          return false;
        }

        // We aren't included, and we can freely append to the end of the layer
        return true;
      })
      .map((layer): [Produced<SourceValue>, LayerTarget<SourceValue>] => [layer, this.layerTargets.get(layer)]);

    if (compatibleLayers.length === 0) {
      return [await this.getNewLayer()];
    }

    return compatibleLayers;

    function getProducerIndex(producer: Producer<SourceValue>): number {
      return producerArray.indexOf(producer);
    }
  }

  async getNewLayer(): Promise<[Produced<SourceValue>, LayerTarget<SourceValue>]> {
    let previousLayer: AsyncIterable<SourceValue> = asyncIterable([]);

    if (this.layers.length) {
      const previousIndex = this.layers.length - 1;
      previousLayer = this.layerViews.get(this.layers[previousIndex]);
      if (!isAsyncIterable(previousLayer)) {
        throw new Error("Expected to find view for previous layer");
      }
      // Can no longer be used
      this.layerViews.delete(this.layers[previousIndex]);
    }

    const next = async (): Promise<Produced<SourceValue>> => {
      if (!this.isPending()) {
        target.close();
        return undefined;
      }
      await this.nextStep();
      return next();
    };

    const target = getListAsyncIterable<Produced<SourceValue>, TransientAsyncIteratorSource<Produced<SourceValue>>>(source(next));

    // Grab the iterable straight away, this will ensure we will always have _all_ the values for it
    const targetIterable = target[Symbol.asyncIterator]();

    const layerIterableBase = asyncExtendedIterable(previousLayer)
      .union(
        asyncExtendedIterable(
          (
            async function *iterate() {
              let next;
              do {
                next = await targetIterable.next();
                if (!next.done) {
                  yield next.value;
                }
              } while (!next.done);
            }
          )()
        )
          .flatMap((value: Produced<SourceValue>) => value)
      )
      .retain();

    const view = asyncExtendedIterable<AsyncIterable<SourceValue>>(asyncView<SourceValue>(layerIterableBase)).take(2);
    const viewIterable = view[Symbol.asyncIterator]();
    const left: IteratorResult<AsyncIterable<SourceValue>, AsyncIterable<SourceValue>> = await viewIterable.next();
    const right: IteratorResult<AsyncIterable<SourceValue>, AsyncIterable<SourceValue>> = await viewIterable.next();

    if (!(isAsyncIterable(left.value) && isAsyncIterable(right.value))) {
      throw new Error("Expected to be able to create a view for our layer, but couldn't");
    }

    const layerIterable = getListAsyncIterable(layerIterableBase);

    this.layers.push(layerIterable);
    this.newLayers.push(layerIterable);
    this.layerProducers.set(layerIterable, new Set());
    this.layerTargets.set(layerIterable, target);
    this.layerViews.set(layerIterable, right.value);

    return [layerIterable, target];
  }

  getProducerPromises(): ProducedResultPromise<SourceValue>[] {
    return extendedIterable(this.producers.keys())
      .filter(producer => !this.producersClosed.has(producer) && !!this.producers.get(producer))
      .map(
        producer => {
          const currentPromise = this.producerPromises.get(producer);
          if (currentPromise) {
            return currentPromise;
          }
          const nextPromise = this.producers.get(producer).next().then(
            (result): ProducedResultPromiseValue<SourceValue> => [producer, result]
          );
          this.producerPromises.set(producer, nextPromise);
          return nextPromise;
        }
      )
      .toArray();
  }

}

export function merge<SourceValue>(toMerge: Merge<SourceValue>): Producer<SourceValue> {
  return getListUpdaterAsyncIterable(mergeGenerator(toMerge));

  async function *mergeGenerator(toMerge: Merge<SourceValue>): AsyncIterable<Produced<SourceValue>> {
    const merger = new Merger(toMerge);
    try {
      yield* merger.cycle();
    } finally {
      await merger.close();
    }
  }
}
