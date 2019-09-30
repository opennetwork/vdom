/*
Each block can occupy any space, if a block needs more space, it must expand on its maximum boundary
When a block is created, it takes on the next position after the previously allocated block, this means if a block
is moved, all children after will take up that space, this allows natural squashing as blocks are filled and later
blocks are removed
A block can be swapped to another position

A block is accessed using a symbol

A block is always at position -1 if it has never been expanded

We also want to know if a block is open, meaning it can replace anything occupying from their index
 */
function sum(values: (number | undefined)[]): number {
  return values.reduce(
    (sum, value) => (typeof value === "number" ? value : 0) + sum,
    0
  );
}

export class Blocks {

  private previousReferences: Map<symbol, number>;
  private references = new Map<symbol, number>();
  private finalPointer: symbol;
  private positions: number[] = [];
  private lengths: number[] = [];
  private fragments: Blocks[] = [];

  private cachedLength: number = 0;
  private cachedOccupation: [number, number][] = undefined;

  constructor(private readonly parent?: Blocks, private readonly parentPointer?: symbol, private readonly atIndex?: (() => number), public readonly replacing?: Blocks) {
    if (this.parent && !this.parentPointer) {
      throw new Error("Expected pointer when parent given");
    }
  }

  getInfo(pointer: symbol): [number, number] {
    const index = this.getInternalIndex(pointer);
    const position = this.positions[index];
    const length = this.lengths[index];
    return [typeof position === "number" ? position : -1, Math.max(0, typeof length === "number" ? length : 0)];
  }

  get(pointer: symbol): [number, number] {
    const index = this.getInternalIndex(pointer);

    // We already know the space we're occupying
    //
    // But only if we don't change based on an external function
    if (this.cachedOccupation && this.cachedOccupation[index] && !this.parent && !this.atIndex) {
      return this.cachedOccupation[index];
    }

    const position = this.positions[index];
    const length = typeof this.lengths[index] === "number" ? this.lengths[index] : 0;

    const indexes = Array.from(this.references.values());
    const positioned = indexes.filter(index => typeof this.positions[index] === "number");

    // This are all the indexes that we need to take into account that sit _before_
    // our block
    const previousIndexes = positioned.filter(index => this.positions[index] < position);

    // Our index is the maximum length for positions before our own
    const occupiedIndex = (this.atIndex ? this.atIndex() : 0) + (this.parent ? this.parent.index(this.parentPointer) : 0) + sum(previousIndexes.map(index => this.lengths[index]));

    const occupation: [number, number] = [occupiedIndex, length];

    if (!this.parent && !this.atIndex) {
      this.cachedOccupation = this.cachedOccupation || [];
      this.cachedOccupation[index] = occupation;
    }

    return occupation;
  }

  index(pointer: symbol): number {
    return this.get(pointer)[0];
  }

  length(pointer: symbol): number {
    const index = this.getInternalIndex(pointer);
    return this.lengths[index] || 0;
  }

  expand(pointer: symbol, by: number = 1) {
    this.set(pointer, previous => previous + by);
  }

  reduce(pointer: symbol, by: number = 1) {
    this.set(pointer, previous => previous - by);
  }

  set(pointer: symbol, nextLength: number | ((previous: number) => number)) {
    const [position, length] = this.getInfo(pointer);
    this.move(pointer, position, typeof nextLength === "function" ? nextLength(length) : nextLength);
  }

  getIndexer(pointer: symbol): () => number {
    return () => this.get(pointer)[0];
  }

  getSetter(pointer: symbol): (nextLength: number) => void {
    // Trigger stable index
    this.getInfo(pointer);
    return nextLength => this.set(pointer, nextLength);
  }

  move(pointer: symbol, nextPosition: number, nextLength: number) {
    const index = this.getInternalIndex(pointer);
    const currentPosition = this.positions[index];
    const currentLength = typeof this.lengths[index] === "number" ? this.lengths[index] : 0;
    // Any movement resets occupation
    // If we go through an figure out next occupation points, then we might as well
    // pre-calculate it all, which may not be needed
    // We have all the information required to calculate each value individually
    this.cachedOccupation = undefined;

    if (currentPosition !== nextPosition) {
      this.positions[index] = nextPosition;
    }

    if (currentLength !== nextLength) {
      this.lengths[index] = nextLength;
      this.cachedLength = this.cachedLength + (nextLength - currentLength);
      // Only on size change we will notify externally, as only changed space changes what externally we care about
      if (this.parent) {
        this.parent.set(this.parentPointer, this.cachedLength);
      }
    }
  }

  size() {
    if (typeof this.cachedLength === "number") {
      return this.cachedLength;
    }
    return this.cachedLength = sum(this.lengths);
  }

  parentSize(): number {
    if (this.parent) {
      return this.parent.parentSize();
    } else {
      return this.size();
    }
  }

  givenSize() {
    if (this.parent) {
      return this.parent.length(this.parentPointer);
    } else {
      return this.size();
    }
  }

  private getInternalIndex(pointer: symbol): number {
    if (!pointer) {
      throw new Error("Required a pointer value");
    }
    const existingIndex = this.references.get(pointer);
    if (typeof existingIndex === "number") {
      return existingIndex;
    }
    if (this.finalPointer === pointer) {
      throw new Error("We found a pointer that we expected to have a value for!");
    }
    if (!this.finalPointer) {
      // First pointer
      this.references.set(pointer, 0);
      this.finalPointer = pointer;
      this.positions[0] = 0;
      return 0;
    }
    const finalIndex = this.references.get(this.finalPointer);
    const index = finalIndex + 1;
    this.references.set(pointer, index);
    this.positions[index] = Math.max(...this.positions.filter(value => typeof value === "number")) + 1;
    this.finalPointer = pointer;
    return index;
  }

  fragment(pointer: symbol, replacing?: Blocks): Blocks {
    const index = this.getInternalIndex(pointer);
    if (this.fragments[index]) {
      return this.fragments[index];
    }
    this.fragments[index] = new Blocks(
      this,
      pointer,
      undefined,
      replacing
    );
    return this.fragments[index];
  }

  has(pointer: symbol) {
    return this.references.has(pointer);
  }

  clearFragments() {
    this.fragments = [];
  }

}
