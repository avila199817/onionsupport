import { App } from "./app/index.js";
import { AppCore } from "./core/core.js";

AppCore.ready(() => {
  App.boot();
});
