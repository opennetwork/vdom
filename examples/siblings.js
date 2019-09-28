import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import htm from "htm";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

async function *SiblingInterval() {

  let count = 0;
  while (true) {
    yield html`<span data-value=${count}>Interval ${count}</span>`;
    if (typeof window === "undefined") {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    count += 1;
  }

}

function Sibling() {
  return html`
    <button ...${{}}>Sibling 2</button>
    ${h(SiblingInterval)}
  `;
}

const node = html`
  <main ...${{}}>
    <p ...${{}}>Sibling 1</p>
    ${h(Sibling)}
    <div ...${{}}>Sibling 3</div>
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


