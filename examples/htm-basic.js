import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import htm from "htm";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

const node = html`
  <main ...${{}}>
    <p ...${{}}>Content 1</p>
    <p ...${{}}>Content 2</p>
  </main>
`;

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


