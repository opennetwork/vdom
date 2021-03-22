import dom from "./jsdom.js";
import { render } from "../dist/index.js";
import { createVNode } from "@opennetwork/vnode";
import {clean} from "./clean.js";
import { deferred } from "@opennetwork/progressive-merge/dist/deferred.js";

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
        getDocumentNode: root => root.ownerDocument.createElement("div"),
        // This is run after we have have attached to to the DOM, and after we have run any more tasks
        // like setting attributes, but _before_ children are mounted
        onBeforeRender: mounted => console.log("div", { mounted })
      },
      [
        createVNode(context, "button", {}),
        createVNode(
          context,
          async function *() {
            console.log("Start 1");

            const { promise: firstButtonPromise, resolve: onBeforeRenderFirstButton } = deferred();
            yield createVNode(
              context,
              "somename",
              {
                reference: "a",
                onBeforeRender: onBeforeRenderFirstButton,
                attributes: {
                  type: "somename"
                }
              },
              "hello",
              "hello",
              "hello"
            );
            const firstButton = await firstButtonPromise;

            // We will have a reference to our button here
            console.log({ firstButton });

            // We can do this here if we wanted
            // ourFirstButton.setAttribute("key", "value");

            const { promise: secondButtonPromise, resolve: onBeforeRenderSecondButton } = deferred();
            yield createVNode(
              context,
              "button",
              {
                reference: "b",
                onBeforeRender: onBeforeRenderSecondButton,
                attributes: {
                  type: "button"
                }
              },
              [
                "hello",
                "hello2"
              ]
            );
            const secondButton = await secondButtonPromise;

            // We will have a reference to our button here
            console.log({ secondButton });

            // We can do this here if we wanted
            // ourSecondButton.setAttribute("key", "value");

            console.log("End 1");
          },
          {}
        )
      ]
    );
    console.log("End");
  },
  {}
);

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


