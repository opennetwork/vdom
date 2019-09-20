import { asyncExtendedIterable, asyncIterable, extendedIterable, source, TransientAsyncIteratorSource } from "iterable";

type Produced<SourceValue> = AsyncIterable<SourceValue>;
type Producer<SourceValue> = AsyncIterable<Produced<SourceValue>>;
type Merge<SourceValue> = AsyncIterable<Producer<SourceValue>>;

type ProducedResult<SourceValue> = IteratorResult<Produced<SourceValue>>;
type ProducerResult<SourceValue> = IteratorResult<Producer<SourceValue>>;

type ProducedTarget<SourceValue> = TransientAsyncIteratorSource<Produced<SourceValue>>;

type ProducedResultPromiseValue<SourceValue> = [Producer<SourceValue>, ProducedResult<SourceValue>];
type ProducedResultPromise<SourceValue> = Promise<ProducedResultPromiseValue<SourceValue>>;

type LeftResult<SourceValue> = ProducerResult<SourceValue>;
type RightResult<SourceValue> = ProducedResultPromiseValue<SourceValue>;
type LeftRight<SourceValue> = [LeftResult<SourceValue>, RightResult<SourceValue>];

class Merger<SourceValue> {

  private producersIterator: AsyncIterator<Producer<SourceValue>>;
  private nextProducerPromise: Promise<ProducerResult<SourceValue>>;

  private newLayers: Produced<SourceValue>[] = [];

  private readonly producers = new Map<Producer<SourceValue>, AsyncIterator<Produced<SourceValue>>>();
  private readonly producersClosed = new Set<Producer<SourceValue>>();
  private readonly producersUsed = new Set<Producer<SourceValue>>();
  private readonly producerPromises = new Map<Producer<SourceValue>, ProducedResultPromise<SourceValue>>();
  private readonly producerTargets = new Map<Producer<SourceValue>, ProducedTarget<SourceValue>>();
  private readonly producerIterables = new Map<Producer<SourceValue>, AsyncIterable<Produced<SourceValue>>>();


  constructor(toMerge: Merge<SourceValue>) {
    this.producersIterator = toMerge[Symbol.asyncIterator]();
  }

  async close() {
    const iterator = this.producersIterator;
    this.producersIterator = undefined;
    extendedIterable(this.producerTargets.values()).forEach(
      value => value.close()
    );
    this.producers.clear();
    this.producersClosed.clear();
    this.producersUsed.clear();
    // TODO settle these promises
    this.producerPromises.clear();
    this.producerTargets.clear();
    // TODO close these iterables
    this.producerIterables.clear();
    if (iterator && iterator.return) {
      try {
        await iterator.return();
      } catch (forgottenError) {

      }
    }
  }

  async *cycle(): Producer<SourceValue> {
    do {
      console.log(this);
      await this.nextStep();
      // Output anything new
      while (this.newLayers.length) {
        yield this.newLayers.shift();
      }
    } while (this.isPending());

    if (!this.isPending()) {
      await this.close();
    }

    // This is for when we never produced a value
    if (this.producers.size === 0) {
      yield asyncIterable([]);
    }
  }

  isPending(): boolean {
    return !!(
      this.producersIterator ||
      this.hasPromise()
    );
  }

  hasPromise(): boolean {
    if (this.nextProducerPromise) {
      return true;
    }
    return extendedIterable(this.producerPromises.values()).some(value => !!value);
  }

  async nextStep() {
    const nextPromise = this.getNext();
    if (!nextPromise) {
      return;
    }

    const [left, right] = await nextPromise;

    if (left) {
      await this.nextProducer(left);
    }

    if (right) {
      await this.nextProduced(right);
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

    console.log(producerPromises.length);

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

  nextProduced([producer, result]: ProducedResultPromiseValue<SourceValue>) {
    const target = this.getProducerTarget(producer);
    this.producerPromises.set(producer, undefined);
    if (result.done) {
      target.close();
      this.producersClosed.add(producer);
      this.producerPromises.delete(producer);
      return;
    }

    const previouslyInFlight = this.producersUsed.has(producer);
    this.producersUsed.add(producer);
    target.push(result.value);

    if (!previouslyInFlight) {
      this.addNextLayer();
    }
  }

  addNextLayer() {
    // This is the order that producers were provided in
    const sources = extendedIterable(this.producerTargets.keys())
      .map(producer => this.producerIterables.get(this.producerTargets.get(producer)))
      .toArray();
    const union = sources.reduce((union, iterable) => union.union(iterable), asyncExtendedIterable([]));
    const producer: Produced<SourceValue> = union.flatMap(value => value);
    this.newLayers.push(producer);
  }

  getProducerTarget(producer: Producer<SourceValue>): ProducedTarget<SourceValue> {
    let target = this.producerTargets.get(producer);
    if (target) {
      return target;
    }
    target = source();
    target.hold();
    this.producerIterables.set(target, asyncExtendedIterable(target).retain());
    this.producerTargets.set(producer, target);
    return target;
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

export async function *merge<SourceValue>(toMerge: AsyncIterable<AsyncIterable<AsyncIterable<SourceValue>>>): AsyncIterable<AsyncIterable<SourceValue>> {
  const merger = new Merger(toMerge);
  try {
    yield* merger.cycle();
  } finally {
    await merger.close();
  }
}
