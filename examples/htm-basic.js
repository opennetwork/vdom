import dom from "./jsdom.js";
import { render } from "../dist/index.js";
import { createVNode } from "@opennetwork/vnode";
import htm from "htm";
import { clean } from "./clean.js";

const h = createVNode;
const html = htm.bind(h);

const node = html`
  <main reference="main">
    <p reference="p1">Content 1</p>
    <p reference="p2">Content 2</p>
  </main>
`;

render(
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


