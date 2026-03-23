"use strict";

/* =========================
   SEARCH (ONION PRO FINAL CLEAN)
   - Sin leaks
   - Usa router (no navega manual)
========================= */

(function(){

  if(!window.Onion){
    console.error("💥 Onion no está definido (search.js)");
    return;
  }

  const Onion = window.Onion;

  Onion.ui.initSearch = function(){

    const input = document.querySelector("#topbar-search");
    const container = document.querySelector("#topbar-search-results");

    if (!input || !container) return;
    if (input.__onionSearchInit) return;

    input.__onionSearchInit = true;

    let timer = null;
    let controller = null;

    const show = () => container.classList.add("active");

    const hide = () => {
      container.classList.remove("active");
      container.innerHTML = "";
    };

    const highlight = (text, q) => {
      if (!q) return text;

      const i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i === -1) return text;

      return (
        text.slice(0, i) +
        "<mark>" + text.slice(i, i + q.length) + "</mark>" +
        text.slice(i + q.length)
      );
    };

    const render = (results, q = "") => {

      container.innerHTML = "";

      if (!results.length){
        container.innerHTML = `<div class="search-empty">Sin resultados</div>`;
        return show();
      }

      results.slice(0, 20).forEach(r => {

        const el = document.createElement("div");
        el.className = "search-result";

        el.innerHTML = `
          <div class="search-text">
            <div class="search-title">${highlight(r.title || "", q)}</div>
            ${r.subtitle ? `<div class="search-subtitle">${highlight(r.subtitle, q)}</div>` : ""}
          </div>
        `;

        el.addEventListener("click", ()=>{

          hide();

          if (!r.url) return;

          // 🔥 USAR ROUTER (NO MANUAL)
          Onion.router?.navigate?.(r.url);

        });

        container.appendChild(el);

      });

      show();

    };

    const doSearch = async (q) => {

      try{

        if(controller){
          controller.abort();
        }

        controller = new AbortController();

        const url = Onion.config.API + "/search?q=" + encodeURIComponent(q);

        const res = await fetch(url, {
          signal: controller.signal,
          credentials: "include"
        });

        if(!res.ok){
          throw new Error("HTTP " + res.status);
        }

        const data = await res.json();

        return data?.results || [];

      }catch(e){

        if(e.name === "AbortError"){
          return [];
        }

        Onion.error("💥 SEARCH ERROR:", e);
        return [];

      }

    };

    const onInput = ()=>{

      const value = input.value.trim();

      clearTimeout(timer);

      if (!value){
        hide();
        return;
      }

      timer = setTimeout(async ()=>{

        const results = await doSearch(value);
        render(results, value);

      }, 200);

    };

    input.addEventListener("input", onInput);

    const onFocus = async ()=>{

      const value = input.value.trim();
      if (!value) return;

      const results = await doSearch(value);
      render(results, value);

    };

    input.addEventListener("focus", onFocus);

    const outsideClick = (e)=>{
      if (!e.target.closest(".topbar-search-wrap")){
        hide();
      }
    };

    document.addEventListener("click", outsideClick);

    Onion.onCleanup(()=>{

      clearTimeout(timer);

      if(controller){
        try{ controller.abort(); }catch{}
      }

      input.removeEventListener("input", onInput);
      input.removeEventListener("focus", onFocus);
      document.removeEventListener("click", outsideClick);

      input.__onionSearchInit = false;

    });

  };

  Onion.events.on("nav:ready", ()=>{
    Onion.ui.initSearch();
  });

})();
