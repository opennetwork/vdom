import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext, marshal } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import htm from "htm";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

async function *SiblingFinalInterval() {

  let count = 0;
  while (count < 3) {
    yield html`
      <h4 data-value=${count} reference="interval-final">Final Interval ${count}</h4>
    `;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }

}

async function *SiblingInterval() {

  let count = 0;
  while (count < 3) {
    yield html`
      <span data-value=${count} reference="interval">Interval ${count}</span>
      <!--${h(SiblingFinalInterval)}-->
    `;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }
  console.log("Completed interval");

}

function Sibling() {
  return html`
    <h2 ...${{ reference: "s2" }}>Sibling 2</h2>
    ${h(SiblingInterval)}
    <h3 ...${{ reference: "s4" }}>Sibling 3</h3>
  `;
}

const node = html`
  <main ...${{}}>
    <h1 ...${{ reference: "s1" }}>Sibling 1</h1>
    ${h(Sibling)}
    <h4 ...${{ reference: "s4" }}>Sibling 4</h4>
  </main>
`;

const dom = new JSDOM.JSDOM();

render(
  node,
  dom.window.document.body
)
// marshal(node)
  .then(value => console.log(JSON.stringify(value, null, "  ")))
  .then(() => {
    console.log("Complete!");
    console.log(dom.window.document.body.outerHTML);
  })
  .catch(error => console.error(error));


