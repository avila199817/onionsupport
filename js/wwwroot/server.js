"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (server.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     SAFE STATE
  ========================================================= */

  Onion.state = Onion.state || {};

  /* =========================================================
     SCRIPT LOADER
  ========================================================= */

  function loadScript(src){
    return new Promise((resolve)=>{

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.async = false;

      s.onload  = () => resolve(true);
      s.onerror = () => {
        console.warn("⚠️ NO CARGADO:", src);
        resolve(false);
      };

      document.head.appendChild(s);

    });
  }

  async function loadGroup(name, list){
    console.log(`📦 ${name}`);
    for(const src of list){
      await loadScript(src);
    }
  }

  /* =========================================================
     FILES
  ========================================================= */

  const CORE = [
    "/js/wwwroot/router/core/core.js",
    "/js/wwwroot/router/core/events.js",
    "/js/wwwroot/router/core/cleanup.js",
    "/js/wwwroot/router/core/viewEngine.js",
    "/js/wwwroot/router/core/index.js"
  ];

  const INIT = [
    "/js/wwwroot/router/init/init.js",
    "/js/wwwroot/router/init/boot.js",
    "/js/wwwroot/router/init/index.js"
  ];

  const UI = [
    "/js/wwwroot/router/ui/ui.js",
    "/js/wwwroot/router/ui/loader.js",
    "/js/wwwroot/router/ui/sidebar.js",
    "/js/wwwroot/router/ui/toast.js",
    "/js/wwwroot/router/ui/topbar.js",
    "/js/wwwroot/router/ui/index.js"
  ];

  const FEATURES = [
    "/js/wwwroot/router/features/fetch.js",
    "/js/wwwroot/router/features/router.js",
    "/js/wwwroot/router/features/render.js",
    "/js/wwwroot/router/features/i18n.js",
    "/js/wwwroot/router/features/prefetch.js",
    "/js/wwwroot/router/features/auth.js",
    "/js/wwwroot/router/features/index.js"
  ];

  const ROUTERS = [
    "/js/wwwroot/router/incidencias/index.js",
    "/js/wwwroot/router/facturas/index.js",
    "/js/wwwroot/router/clientes/index.js",
    "/js/wwwroot/router/usuarios/index.js"
  ];

  async function loadAll(){
    await loadGroup("CORE", CORE);
    await loadGroup("INIT", INIT);
    await loadGroup("UI", UI);
    await loadGroup("FEATURES", FEATURES);
    await loadGroup("ROUTERS", ROUTERS);
  }

  /* =========================================================
     SERVER
  ========================================================= */

  const routes = [];

  function use(path, handler){
    routes.push({ path, handler });

    // 🔥 ordenar por prioridad (más largo primero)
    routes.sort((a, b) => b.path.length - a.path.length);
  }

  function match(path){
    return routes.find(r => path.startsWith(r.path)) || null;
  }

  function createContext(){
    return {
      path: Onion.router?.get?.() || "/",
      query: Onion.router?.getQuery?.() || {},
      user: Onion.getUser?.(),
      navigate: Onion.router?.navigate,
      render: Onion.render
    };
  }

  async function handle(){

    const ctx = createContext();

    try{

      const route = match(ctx.path);

      if(!route){
        console.warn("⚠️ Ruta no encontrada:", ctx.path);
        return ctx.render?.("404");
      }

      await route.handler(ctx);

    }catch(e){

      console.error("💥 SERVER ERROR:", e);
      ctx.render?.("error");

    }

  }

  Onion.server = { use, handle };

  /* =========================================================
     ROUTERS
  ========================================================= */

  function connectRouters(){

    if(window.FacturasRouter)    use("/facturas", window.FacturasRouter);
    if(window.IncidenciasRouter) use("/incidencias", window.IncidenciasRouter);
    if(window.ClientesRouter)    use("/clientes", window.ClientesRouter);
    if(window.UsersRouter)       use("/usuarios", window.UsersRouter);

    use("/", async (ctx)=> ctx.render("home"));

  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function bindNavigation(){

    if(!Onion.router?.navigate) return;

    const original = Onion.router.navigate;

    Onion.router.navigate = function(path){

      original(path);
      handle();

    };

    window.addEventListener("popstate", handle);

  }

  /* =========================================================
     START
  ========================================================= */

  async function start(){

    console.log("🧅 Booting Onion...");

    await loadAll();

    connectRouters();
    bindNavigation();

    await Onion.init?.();

    Onion.state.appReady = true;

    await handle();

    console.log("🚀 Onion READY");

  }

  document.addEventListener("DOMContentLoaded", start);

})();
