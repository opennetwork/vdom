import dom from "./jsdom";
import { litRender, EXPERIMENT_attributes } from "../dist/index.js";
import { withContext } from "@opennetwork/vnode";
import htm from "htm";
import { clean } from "./clean";

const context = {};
const h = withContext(context);
const html = htm.bind(h);

const node = html`
  <main ...${{}}>
    <section ...${{}}>
        <h1 ...${{}}>Title</h1>
        <p ...${{}}>Content</p>
    </section>
    <button ...${{ [EXPERIMENT_attributes]: { type: "button" } }}>Do something</button>
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
  .catch(error => console.error(error));


