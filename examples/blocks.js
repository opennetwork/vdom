import { Blocks } from "../dist/blocks.js";

const primary = new Blocks();

const initialElementPointer = Symbol("Initial Element Pointer");
primary.set(initialElementPointer, 4);

const fragmentPointer = Symbol("Fragment Pointer");
const fragment = new Blocks(primary.getIndexer(fragmentPointer), primary.getSetter(fragmentPointer), primary.getOpener(fragmentPointer));

const elementPointer = Symbol("Singling Element pointer");
primary.set(elementPointer, 3);

const fragmentElementPointer = Symbol("Fragment Element Pointer");
fragment.set(fragmentElementPointer, 2);
console.log(fragment.get(fragmentElementPointer));
console.log(fragment.get(fragmentElementPointer));

console.log(primary.size(), primary.getIndexer(fragmentPointer)(), fragment.getIndexer(fragmentElementPointer)());


