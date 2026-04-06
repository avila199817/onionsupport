"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (server.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     SCRIPT LOADER
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
     CORE (ORDEN IMPORTANTE)
  ========================================================= */

  const CORE = [
    "/js/wwwroot/router/core/core.js",
    "/js/wwwroot/router/core/cleanup.js",
    "/js/wwwroot/router/core/events.js",
    "/js/wwwroot/router/core/viewEngine.js",
    "/js/wwwroot/router/core/index.js"
  ];

  /* =========================================================
     INIT
  ========================================================= */

  const INIT = [
    "/js/wwwroot/router/init/boot.js",
    "/js/wwwroot/router/init/init.js",
    "/js/wwwroot/router/init/index.js"
  ];

  /* =========================================================
     UI
  ========================================================= */

  const UI = [
    "/js/wwwroot/router/ui/ui.js",
    "/js/wwwroot/router/ui/loader.js",
    "/js/wwwroot/router/ui/sidebar.js",
    "/js/wwwroot/router/ui/toast.js",
    "/js/wwwroot/router/ui/topbar.js",
    "/js/wwwroot/router/ui/index.js"
  ];

  /* =========================================================
     FEATURES BASE
  ========================================================= */

  const FEATURES = [
    "/js/wwwroot/router/features/fetch.js",
    "/js/wwwroot/router/features/router.js",
    "/js/wwwroot/router/features/render.js",
    "/js/wwwroot/router/features/i18n.js",
    "/js/wwwroot/router/features/prefetch.js",
    "/js/wwwroot/router/features/auth.js",
    "/js/wwwroot/router/features/index.js"
  ];

  /* =========================================================
     ROUTERS (TUS MÓDULOS)
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

  async function loadGroup(list){
    for(const src of list){
      await loadScript(src);
    }
  }

  async function loadAll(){

    await loadGroup(CORE);
    await loadGroup(INIT);
    await loadGroup(UI);
    await loadGroup(FEATURES);
    await loadGroup(ROUTERS);

  }

  /* =========================================================
     SERVER ENGINE
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

    const route = Onion.router?.resolve?.() || { path:"/" };

    return {
      path: route.path,
      query: route.query || {},
      user: Onion.getUser?.(),
      navigate: Onion.router?.navigate,
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
      Onion.render?.();

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

    if(window.AuthRouter)        use("/auth", window.AuthRouter);
    if(window.FacturasRouter)    use("/facturas", window.FacturasRouter);
    if(window.IncidenciasRouter) use("/incidencias", window.IncidenciasRouter);
    if(window.ClientesRouter)    use("/clientes", window.ClientesRouter);
    if(window.UsersRouter)       use("/usuarios", window.UsersRouter);

    // fallback
    use("/", async (ctx)=> ctx.render());

  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function bindNavigation(){

    if(!Onion.router?.navigate){
      return;
    }

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

      await Onion.init?.();

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
