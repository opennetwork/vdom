import dom from "./jsdom.js";
import { render, DOMVContext, createTimeline, marshalTimeline } from "../dist/index.js";
import { createNode } from "@opennetwork/vnode";
import { deferred } from "@opennetwork/progressive-merge/dist/deferred.js";
import { v4 } from "uuid";

const context = new DOMVContext({
  root: dom.window.document.body
});
const timelinePromise = createTimeline(context);

const node = createNode(
  async function *() {
    yield createNode(
      "div",
      {
        // We can hold onto our own node if we wanted to, or if we already had one
        getDocumentNode: root => root.ownerDocument.createElement("div"),
        // This is run after we have have attached to to the DOM, and after we have run any more tasks
        // like setting attributes, but _before_ children are mounted
      },
      [
        createNode("button", { reference: "button1" }, "some text", "text 2"),
        createNode(
          async function *() {

            const { promise: firstButtonPromise, resolve: onBeforeRenderFirstButton } = deferred();
            yield createNode(
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
            // const firstButton = await firstButtonPromise;

            // We will have a reference to our button here
            // console.log({ firstButton });

            // We can do this here if we wanted
            // ourFirstButton.setAttribute("key", "value");

            const { promise: secondButtonPromise, resolve: onBeforeRenderSecondButton } = deferred();
            yield createNode(
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
            // const secondButton = await secondButtonPromise;

            // We will have a reference to our button here
            // console.log({ secondButton });

            // We can do this here if we wanted
            // ourSecondButton.setAttribute("key", "value");

          },
          {
            reference: "gen1"
          }
        )
      ]
    );
  },
  {}
);

await render(
  node,
  context
);

await context.close();

console.log(JSON.stringify(await marshalTimeline(await timelinePromise, v4), undefined, "  "));
