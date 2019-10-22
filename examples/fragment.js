import dom from "./jsdom";
import { litRender } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import htm from "htm";
import { clean } from "./clean";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

async function *SiblingInterval() {
  let count = 0;
  while (count < 3) {
    yield html`
    <span attributes=${{ "data-value": count }}>Interval ${count}</span>`;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }

}

const node = h(SiblingInterval);

litRender(
  node,
  dom.window.document.body
)
  .then(() => {
    clean(dom.window.document.body);
    console.log("Complete");
    console.log(dom.serialize());
  })
  .catch(error => {
    clean(dom.window.document.body);
    console.log("Error");
    console.log(dom.serialize());
    console.log(error);
    console.error(JSON.stringify(error, null, "  "));
  });


