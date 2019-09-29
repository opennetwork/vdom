import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import htm from "htm";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

async function *SiblingFinalInterval() {

  let count = 0;
  while (count < 3) {
    yield html`
      <h4 data-value=${count}>Final Interval ${count}</h4>
    `;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }

}

async function *SiblingInterval() {

  let count = 0;
  while (count < 3) {
    yield html`
      <h3 data-value=${count}>Interval ${count}</h3>
      ${h(SiblingFinalInterval)}
    `;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }

}

function Sibling() {
  return html`
    <h2 ...${{}}>Sibling 3</h2>
    ${h(SiblingInterval)}
    <h5 ...${{}}>Sibling 4</h5>
  `;
}

const node = html`
  <main ...${{}}>
    <h1 ...${{}}>Sibling 1</h1>
    ${h(Sibling)}
    <h6 ...${{}}>Sibling 5</h6>
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


