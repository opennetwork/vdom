import { Merger } from "../dist/merge.js";
import { asyncIterable, asyncExtendedIterable } from "iterable";

async function run() {
  const source = asyncIterable([
    asyncIterable([
      asyncExtendedIterable([
        "1"
      ]),
      asyncExtendedIterable([
        "2",
        "3"
      ])
    ]),
    asyncIterable([
      asyncExtendedIterable([
        "4",
        "5"
      ]),
      asyncExtendedIterable([
        "6",
        "7"
      ])
    ])
  ]);

  const merger = new Merger(source);

  console.log(
    await asyncExtendedIterable(merger.cycle()).map(value => asyncExtendedIterable(value).toArray()).toArray()
  )
}

run()
  .then(() => console.log("Complete"))
  .catch(console.error);
