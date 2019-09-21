import {
  asyncExtendedIterable,
  asyncIterable,
  extendedIterable,
  source
} from "iterable";
import {
  getListAsyncIterable,
  getListUpdaterAsyncIterable,
  ListAsyncIterable,
  ListUpdaterAsyncIterable
} from "./branded-iterables";

type Produced<SourceValue> = ListAsyncIterable<SourceValue>;
type Producer<SourceValue> = ListUpdaterAsyncIterable<Produced<SourceValue>>;
type Merge<SourceValue> = AsyncIterable<Producer<SourceValue>>;

type ProducedResult<SourceValue> = IteratorResult<Produced<SourceValue>>;
type ProducerResult<SourceValue> = IteratorResult<Producer<SourceValue>>;

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
  private readonly producerValues = new Map<Producer<SourceValue>, Produced<SourceValue>>();

  private readonly newLayers: Produced<SourceValue>[] = [];

  private nextStepPromise: Promise<void>;

  private returnedAnyLayer: boolean = false;

  constructor(toMerge: Merge<SourceValue>) {
    this.producersIterator = toMerge[Symbol.asyncIterator]();
  }

  async close() {
    const iterator = this.producersIterator;
    this.producersIterator = undefined;

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

    const nextValue = getListAsyncIterable(asyncExtendedIterable<SourceValue>(result.value).retain());
    this.producerValues.set(producer, nextValue);
    await this.getNewLayer();

  }

  async getNewLayer() {
    const producers = Array.from(this.producers.keys());

    const nextLayer = getListAsyncIterable(
      asyncExtendedIterable(producers)
        .filter(producer => this.producerValues.has(producer))
        .flatMap(producer => this.producerValues.get(producer))
    );

    this.newLayers.push(nextLayer);
  }

  getProducerPromises(): ProducedResultPromise<SourceValue>[] {
    return Array.from(this.producers.keys())
      .filter(producer => !this.producersClosed.has(producer) && !!this.producers.get(producer))
      .map(
        (producer: Producer<SourceValue>): ProducedResultPromise<SourceValue> => {
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
      );
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
