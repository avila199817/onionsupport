"use strict";

(function(){

  // 🔥 CORE BASE (auto-creado)
  if(!window.Onion){
    window.Onion = {};
  }

  const Onion = window.Onion;

  /* =========================================================
     STATE
  ========================================================= */

  Onion.state = Onion.state || {};

  /* =========================================================
     🔥 RENDER FALLBACK (ANTI PANTALLA BLANCA)
  ========================================================= */

  if(!Onion.render){
    Onion.render = function(html){

      const el = document.getElementById("view-container");

      if(!el){
        console.error("💥 No existe view-container");
        return;
      }

      el.innerHTML = html || `
        <div style="padding:20px">
          <h1>RENDER OK 🔥</h1>
        </div>
      `;
    };
  }

  /* =========================================================
     SCRIPT LOADER
  ========================================================= */

  function loadScript(src){
    return new Promise((resolve)=>{

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;

      s.onload  = () => resolve(true);
      s.onerror = () => {
        console.warn("⚠️ Error cargando:", src);
        resolve(false);
      };

      document.head.appendChild(s);

    });
  }

  async function loadAll(){

    console.log("📦 Loading scripts...");

    // 👉 opcional (si existen)
    await loadScript("/js/wwwroot/router/features/render.js");
    await loadScript("/js/wwwroot/router/features/router.js");

    // 👉 router ejemplo
    await loadScript("/js/wwwroot/router/incidencias/index.js");

  }

  /* =========================================================
     SERVER
  ========================================================= */

  const routes = [];

  function use(path, handler){
    routes.push({ path, handler });
  }

  function match(path){
    return routes.find(r => path.startsWith(r.path));
  }

  function createContext(){
    return {
      path: Onion.router?.get?.() || "/",
      render: Onion.render
    };
  }

  async function handle(){

    const ctx = createContext();

    const route = match(ctx.path);

    if(route){
      return route.handler(ctx);
    }

    // 🔥 fallback seguro
    ctx.render(`
      <div style="padding:20px">
        <h1>ONION FUNCIONA 🔥</h1>
      </div>
    `);

  }

  Onion.server = { use, handle };

  /* =========================================================
     ROUTERS
  ========================================================= */

  function connectRouters(){

    if(window.IncidenciasRouter){
      use("/incidencias", window.IncidenciasRouter);
    }

    use("/", async (ctx)=>{
      ctx.render(`
        <div style="padding:20px">
          <h1>ONION FUNCIONA 🔥</h1>
        </div>
      `);
    });

  }

  /* =========================================================
     NAVIGATION (SPA SIMPLE)
  ========================================================= */

  function bindNavigation(){

    document.addEventListener("click", (e)=>{

      const link = e.target.closest("a[data-spa]");
      if(!link) return;

      e.preventDefault();

      const href = link.getAttribute("href");

      history.pushState({}, "", href);

      handle();

    });

    window.addEventListener("popstate", handle);

  }

  /* =========================================================
     START
  ========================================================= */

  async function start(){

    console.log("🧅 Starting...");

    await loadAll();

    connectRouters();
    bindNavigation();

    handle();

    console.log("🚀 READY");

  }

  document.addEventListener("DOMContentLoaded", start);

})();
