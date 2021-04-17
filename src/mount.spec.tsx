import { h, createFragment, hydrate, Fragment } from "@opennetwork/vnode";
import JSDOM from "jsdom";
import { DOMVContext } from "./context";
import { Native } from "./native";
import { assertElement } from "./document-node";

describe("mount", () => {
    const dom = new JSDOM.JSDOM();
    const window = dom.window;
    const document = window.document;

    const childCountModifier = 3 + Math.round(Math.random() * 20);

    it("mounts empty", async () => {

        const root = document.createElement("div");
        root.id = "root";

        const context = new DOMVContext({
            root
        });

        function Component(): undefined {
            return undefined;
        }

        await hydrate(context, Native({}, <Component />));

        expect(root.children.length).toEqual(0);

    });

    it("mounts empty but more complex", async () => {

        async function AsyncEmpty(): Promise<undefined> {
            await new Promise<void>(queueMicrotask);
            return undefined;
        }

        async function *YieldedEmpty(): AsyncIterable<undefined> {
            await new Promise<void>(queueMicrotask);
            // Yield nothing

        }

        async function *OnceYieldedThenEmptied(): AsyncIterable<unknown> {
            yield <p>This shouldn't be seen once we finish!</p>;
            await new Promise<void>(queueMicrotask);
            // Yielding empty should clear
            yield undefined;
        }

        function EmptyChildren() {
            return {
                reference: Fragment,
                children: {
                    async *[Symbol.asyncIterator](): AsyncIterable<unknown> {
                        yield [];
                    }
                }
            };
        }

        function Empty(): undefined {
            return undefined;
        }

        function BunchOEmpties() {
            return (
                <>
                    <Empty />,
                    <EmptyChildren />,
                    <OnceYieldedThenEmptied />
                    <YieldedEmpty />,
                    <AsyncEmpty />
                </>
            );
        }

        const root = document.createElement("div");
        root.id = "root";

        const context = new DOMVContext({
            root
        });

        await hydrate(context, Native({}, <BunchOEmpties />));

        expect(root.children.length).toEqual(0);



    });

    it("mounts as first child inside root", async () => {

        const root = document.createElement("div");
        root.id = "root";

        const context = new DOMVContext({
            root
        });

        const expectedResult = `${Math.random()}`;

        function Component() {
            return <p attributes={{"data-testid": "result"}}>{expectedResult}</p>;
        }

        await hydrate(context, Native({}, <Component />));

        expect(root.children.length).toEqual(1);

        const firstChild = root.firstChild;
        expect(firstChild).toBeTruthy();
        assertElement(firstChild);
        expect(firstChild.getAttribute("data-testid")).toEqual("result");
        expect(firstChild.innerHTML).toEqual(expectedResult);

        // Expect it to be the only child
        expect(firstChild).toEqual(root.lastChild);
    });

    it("mounts as second child inside root, appended", async () => {

        const root = document.createElement("div");
        root.id = "root";

        root.append(document.createElement("div"));

        const context = new DOMVContext({
            root
        });

        const expectedResult = `${Math.random()}`;

        function Component() {
            return <p attributes={{"data-testid": "result"}}>{expectedResult}</p>;
        }

        await hydrate(context, Native({}, <Component />));

        expect(root.children.length).toEqual(2);

        const lastChild = root.lastChild;
        expect(lastChild).toBeTruthy();
        assertElement(lastChild);
        expect(lastChild.getAttribute("data-testid")).toEqual("result");
        expect(lastChild.innerHTML).toEqual(expectedResult);

        // Its not the first child
        expect(lastChild).not.toEqual(root.firstChild);
        // Its the second!
        expect(lastChild.previousSibling).toEqual(root.firstChild);
    });

    it("mounts two siblings", async () => {

        const root = document.createElement("div");
        root.id = "root";

        const context = new DOMVContext({
            root
        });

        const expectedResult1 = `${Math.random()}`;
        const expectedResult2 = `${Math.random()}`;

        function Component() {
            return [
                <p attributes={{"data-testid": "result1"}}>{expectedResult1}</p>,
                <p attributes={{"data-testid": "result2"}}>{expectedResult2}</p>
            ];
        }

        await hydrate(context, Native({}, <Component />));

        expect(root.children.length).toEqual(2);

        const firstChild = root.firstChild;
        expect(firstChild).toBeTruthy();
        assertElement(firstChild);
        expect(firstChild.getAttribute("data-testid")).toEqual("result1");
        expect(firstChild.innerHTML).toEqual(expectedResult1);

        const nextSibling = firstChild.nextSibling;
        expect(nextSibling).toBeTruthy();
        assertElement(nextSibling);
        expect(nextSibling.getAttribute("data-testid")).toEqual("result2");
        expect(nextSibling.innerHTML).toEqual(expectedResult2);

        expect(nextSibling).toEqual(root.lastChild);
    });

    it
        .concurrent
        .each([
            [childCountModifier],
            [childCountModifier + (10 * Math.random())],
            [childCountModifier + (100 * Math.random())]
        ])
        ("mounts siblings in correct order %i", async (childCountModifier) => {
            const root = document.createElement("div");
            root.id = "root";

            const context = new DOMVContext({
                root
            });

            const ids = Array.from({ length: childCountModifier }, (unused, index) => `${index}:${Math.random()}`);
            const idsContent = ids.map((id) => `${id}:${Math.random()}:content`);

            async function RandomLoadingTime({ id }: { id: string }) {
                const index = ids.indexOf(id);
                const content = idsContent[index];
                const timeout = 1 + Math.round(Math.random() * 40);
                await new Promise(resolve => setTimeout(resolve, timeout));
                return <p attributes={{"data-testid": id}}>{content}</p>;
            }

            function Component() {
                return ids.map(id => <RandomLoadingTime id={id} />);
            }

            await hydrate(context, Native({}, <Component />));

            const remaining = ids.slice();

            let child = root.firstChild;

            expect(child).toBeTruthy();

            let id;
            do {
                id = remaining.shift();
                expect(child).toBeTruthy();
                assertElement(child);
                expect(child.getAttribute("data-testid")).toEqual(id);
                expect(child.innerHTML).toEqual(idsContent[ids.indexOf(id)]);

                child = child.nextSibling;
            } while (child && remaining.length);

            expect(child).toBeFalsy();
            expect(remaining.length).toBeFalsy();

        });

    it("mounts an already native node", async () => {
        const root = document.createElement("div");
        root.id = "root";

        const context = new DOMVContext({
            root
        });

        const id = `${Math.random()}`;

        async function *Yielding() {
            const native = Native({}, <><p attributes={{"data-testid": id}}>content:{id}</p></>);
            yield {
                reference: Fragment,
                children: {
                    [Symbol.asyncIterator]: native.children[Symbol.asyncIterator].bind(native)
                }
            };
        }

        await hydrate(context, Native({}, <Yielding />));

        const firstChild = root.firstChild;
        expect(firstChild).toBeTruthy();

        console.log({ firstChild });

        assertElement(firstChild);
        expect(firstChild.getAttribute("data-testid")).toEqual(id);
        expect(firstChild.innerHTML).toEqual(`content:${id}`);
    });

});
