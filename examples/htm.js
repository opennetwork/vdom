import dom from "./jsdom.js";
import { render } from "../dist/index.js";
import { createVNode } from "@opennetwork/vnode";
import htm from "htm";
import { clean } from "./clean.js";

const h = createVNode;
const html = htm.bind(h);

const node = html`
  <main attributes=${{}}>
    <section attributes=${{}}>
        <h1 attributes=${{}}>Title</h1>
        <p attributes=${{}}>Content</p>
    </section>
    <button attributes=${{ type: "button" }}>Do something</button>
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


