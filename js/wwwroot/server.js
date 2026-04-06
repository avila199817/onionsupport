"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (server.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     SCRIPT LOADER GLOBAL
  ========================================================= */

  function loadScript(src){
    return new Promise((resolve, reject)=>{

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.async = false;

      s.onload = resolve;
      s.onerror = reject;

      document.head.appendChild(s);

    });
  }

  /* =========================================================
     MODULES (AUTO LOAD)
  ========================================================= */

  const MODULES = [

    // CORE
    "/js/wwwroot/router/core/index.js",

    // INIT
    "/js/wwwroot/router/init/index.js",

    // USER
    "/js/wwwroot/router/user/index.js",

    // UI
    "/js/wwwroot/router/ui/index.js",

    // I18N
    "/js/wwwroot/router/i18n/index.js",

    // FEATURES / PAGES
    "/js/wwwroot/router/pages/index.js",
    "/js/wwwroot/router/features/index.js"

  ];

  /* =========================================================
     ROUTERS (FEATURE MODULES)
  ========================================================= */

  const ROUTERS = [

    "/js/wwwroot/router/auth/index.js",
    "/js/wwwroot/router/incidencias/index.js",
    "/js/wwwroot/router/facturas/index.js",
    "/js/wwwroot/router/clientes/index.js",
    "/js/wwwroot/router/usuarios/index.js"

  ];

  /* =========================================================
     LOAD ALL
  ========================================================= */

  async function loadAll(){

    // CORE primero
    for(const src of MODULES){
      await loadScript(src);
    }

    // luego routers
    for(const src of ROUTERS){
      await loadScript(src);
    }

  }

  /* =========================================================
     SERVER ENGINE (EXPRESS STYLE)
  ========================================================= */

  const routes = [];

  function use(path, handler){
    routes.push({ path, handler });
  }

  function match(path){
    for(const r of routes){
      if(path.startsWith(r.path)){
        return r;
      }
    }
    return null;
  }

  function createContext(){

    const route = Onion.router.resolve();

    return {
      path: route.path,
      query: route.query,
      user: Onion.getUser?.(),
      navigate: Onion.router.navigate,
      render: Onion.render
    };

  }

  async function handle(){

    try{

      const ctx = createContext();

      const route = match(ctx.path);

      if(!route){
        return ctx.render();
      }

      await route.handler(ctx);

    }catch(e){

      console.error("💥 SERVER ERROR:", e);
      Onion.render();

    }

  }

  Onion.server = {
    use,
    handle
  };

  /* =========================================================
     CONNECT ROUTERS
  ========================================================= */

  function connectRouters(){

    // 👇 estos deben existir tras loadAll()

    if(window.AuthRouter)       use("/auth", window.AuthRouter);
    if(window.FacturasRouter)   use("/facturas", window.FacturasRouter);
    if(window.IncidenciasRouter)use("/incidencias", window.IncidenciasRouter);
    if(window.ClientesRouter)   use("/clientes", window.ClientesRouter);
    if(window.UsersRouter)      use("/usuarios", window.UsersRouter);

    // fallback
    use("/", async (ctx)=> ctx.render());

  }

  /* =========================================================
     NAVIGATION HOOK
  ========================================================= */

  function bindNavigation(){

    const originalNavigate = Onion.router.navigate;

    Onion.router.navigate = function(path){

      originalNavigate(path);

      handle();

    };

    window.addEventListener("popstate", handle);

  }

  /* =========================================================
     START
  ========================================================= */

  async function start(){

    try{

      console.log("🧅 Server booting...");

      await loadAll();

      connectRouters();

      bindNavigation();

      await Onion.init();

      Onion.state.appReady = true;

      await handle();

      console.log("🚀 Onion SPA READY");

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

    }

  }

  /* =========================================================
     BOOT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", start);

})();
