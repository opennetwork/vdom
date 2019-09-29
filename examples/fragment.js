import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import htm from "htm";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

async function *SiblingInterval() {
  let count = 0;
  while (count < 3) {
    yield html`
    <span data-value=${count}>Interval ${count}</span>`;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }

}

const node = h(SiblingInterval);

const dom = new JSDOM.JSDOM();

render(
  node,
  dom.window.document.body
)
  .then(() => {
    console.log("Complete");
    console.log(dom.window.document.body.outerHTML);
  })
  .catch(error => console.error(error));


