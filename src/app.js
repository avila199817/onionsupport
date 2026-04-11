import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

AppCore.ready(() => {
  App.boot();
});
