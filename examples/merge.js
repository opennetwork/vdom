import { Merger } from "../dist/merge.js";
import { asyncIterable, asyncExtendedIterable } from "iterable";

async function run() {
  const source = asyncIterable([
    asyncIterable([
      asyncIterable([
        "1"
      ]),
      asyncIterable([
        "2",
        "3"
      ])
    ]),
    asyncIterable([
      asyncIterable([
        "4",
        "5"
      ]),
      asyncIterable([
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
