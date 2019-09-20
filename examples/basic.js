import { render } from "../dist/render.js";
import { createVNode } from "@opennetwork/vnode";
import JSDOM from "jsdom";

const context = {};

const node = createVNode(
  context,
  async function *() {
    console.log("Start");
    yield createVNode(
      context,
      "div",
      {},
      // createVNode(context, "button", {}),
      // createVNode(
      //   context,
      //   async function *() {
      //     console.log("Start 1");
      //     yield createVNode(context, "button", {}, "hello1", "hello2", "hello4");
      //     console.log("End 1");
      //   },
      //   {}
      // )
    );
    console.log("End");
  },
  {}
);

const dom = new JSDOM.JSDOM();

render(node, dom.window.document.body)
  .then(() => {
    console.log("Complete");
    console.log(dom.window.document.body.outerHTML);
  })
  .catch(error => console.error(error));


