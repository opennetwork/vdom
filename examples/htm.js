import dom from "./jsdom";
import { litRender } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import htm from "htm";
import { clean } from "./clean";

const context = {};
const h = withContext(context);
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


