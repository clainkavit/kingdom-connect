// Node 25 and later define their own globalThis.localStorage, which is undefined unless
// Node runs with --localstorage-file. It hides jsdom's, so AsyncStorage (which uses
// localStorage on the web) fails in every test. Put jsdom's storage back.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow && !globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdomWindow.localStorage,
  });
}
