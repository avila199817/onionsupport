"use strict";

(function(){

  if(!window.Onion){
    console.error("💥 Onion no existe (server.js)");
    return;
  }

  const Onion = window.Onion;

  /* =========================================================
     ROUTERS REGISTRY
  ========================================================= */

  const routes = [];

  function use(path, handler){
    routes.push({ path, handler });
  }

  /* =========================================================
     MATCHER
  ========================================================= */

  function match(path){

    for(const r of routes){
      if(path.startsWith(r.path)){
        return r;
      }
    }

    return null;
  }

  /* =========================================================
     CONTEXT
  ========================================================= */

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

  /* =========================================================
     HANDLE REQUEST (LIKE EXPRESS)
  ========================================================= */

  async function handle(){

    try{

      const ctx = createContext();

      const matchRoute = match(ctx.path);

      if(!matchRoute){
        console.warn("⚠️ No route matched:", ctx.path);
        return Onion.render();
      }

      await matchRoute.handler(ctx);

    }catch(e){

      console.error("💥 SERVER ERROR:", e);
      Onion.render();

    }

  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  Onion.server = {
    use,
    handle
  };

  /* =========================================================
     CONNECT ROUTERS 🔥
  ========================================================= */

  // 👇 IMPORTS (como backend)
  // IMPORTANTE: estos scripts deben estar cargados antes

  use("/auth", window.AuthRouter);
  use("/facturas", window.FacturasRouter);
  use("/incidencias", window.IncidenciasRouter);
  use("/clientes", window.ClientesRouter);
  use("/usuarios", window.UsersRouter);
  use("/", window.DashboardRouter);

  /* =========================================================
     NAVIGATION HOOK
  ========================================================= */

  const originalNavigate = Onion.router.navigate;

  Onion.router.navigate = function(path){

    originalNavigate(path);

    handle();

  };

  window.addEventListener("popstate", handle);

  /* =========================================================
     START
  ========================================================= */

  document.addEventListener("DOMContentLoaded", async ()=>{

    try{

      await Onion.init();

      Onion.state.appReady = true;

      await handle();

    }catch(e){

      console.error("💥 BOOT ERROR:", e);

    }

  });

})();
