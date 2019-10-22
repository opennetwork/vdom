import dom from "./jsdom";
import { litRender } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import htm from "htm";
import {clean} from "./clean";

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
  console.log("Completed final interval");
}

async function *SiblingInterval() {

  let count = 0;
  while (count < 3) {
    yield html`
      <span attributes=${{ "data-value": count }} reference="interval">Interval ${count}</span>
      <span attributes=${{ "data-value": count }} reference="interval2">Interval ${count}</span>
      ${h(SiblingFinalInterval)}
    `;
    await new Promise(resolve => setTimeout(resolve, 50));
    count += 1;
  }
  console.log("Completed interval");

}

function Sibling() {
  return html`
    <h2 reference="s2">Sibling 2</h2>
    ${h(SiblingInterval)}
    <h3 reference="s4">Sibling 3</h3>
  `;
}

const node = html`
  <main reference="main">
    <h1 reference="s1">Sibling 1</h1>
    ${h(Sibling)}
    <h4  reference="s4">Sibling 4</h4>
  </main>
`;

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


