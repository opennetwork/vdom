import { render, EXPERIMENT_onAttached, EXPERIMENT_getDocumentNode, EXPERIMENT_attributes } from "../dist/index.js";
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
      {
        // We can hold onto our own node if we wanted to, or if we already had one
        [EXPERIMENT_getDocumentNode]: root => root.ownerDocument.createElement("div"),
        // This is run after we have have attached to to the DOM, and after we have run any more tasks
        // like setting attributes, but _before_ children are mounted
        [EXPERIMENT_onAttached]: mounted => console.log("div", { mounted })
      },
      createVNode(context, "button", {}),
      createVNode(
        context,
        async function *() {
          console.log("Start 1");

          let ourFirstButton;
          yield createVNode(
            context,
            "button",
            {
              reference: "a",
              [EXPERIMENT_onAttached]: mounted => {
                console.log("button a", { mounted });
                ourFirstButton = mounted;
              },
              [EXPERIMENT_attributes]: {
                type: "button"
              }
            },
            "hello",
            "hello",
            "hello"
          );

          // We will have a reference to our button here
          console.log({ ourFirstButton });

          // We can do this here if we wanted
          ourFirstButton.setAttribute("key", "value");

          let ourSecondButton;
          yield createVNode(
            context,
            "button",
            {
              reference: "b",
              [EXPERIMENT_onAttached]: mounted => {
                console.log("button b", { mounted });
                ourSecondButton = mounted;
              },
              [EXPERIMENT_attributes]: {
                type: "button"
              }
            },
            "hello",
            "hello2"
          );

          // We will have a reference to our button here
          console.log({ ourSecondButton });

          // We can do this here if we wanted
          ourSecondButton.setAttribute("key", "value");

          console.log("End 1");
        },
        {}
      )
    );
    console.log("End");
  },
  {}
);

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


