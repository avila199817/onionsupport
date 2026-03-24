"use strict";

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

    /* =========================
       UI
    ========================= */

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

    /* =========================
       RENDER
    ========================= */

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
          if (r.url){
            Onion.router?.navigate?.(r.url);
          }
        });

        container.appendChild(el);

      });

      show();

    };

    /* =========================
       SEARCH
    ========================= */

    const doSearch = async (q) => {

      try{

        if(controller){
          controller.abort();
        }

        controller = new AbortController();

        const url = Onion.config.API + "/search?q=" + encodeURIComponent(q);

        const data = await Onion.fetch(url, {
          signal: controller.signal
        });

        return data?.results || [];

      }catch(e){

        if(e.name === "AbortError"){
          return [];
        }

        console.error("💥 SEARCH ERROR:", e);
        return [];

      }

    };

    /* =========================
       INPUT
    ========================= */

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

    /* =========================
       FOCUS
    ========================= */

    const onFocus = async ()=>{

      const value = input.value.trim();
      if (!value) return;

      const results = await doSearch(value);
      render(results, value);

    };

    input.addEventListener("focus", onFocus);

    /* =========================
       OUTSIDE CLICK
    ========================= */

    const outsideClick = (e)=>{
      if (!e.target.closest(".topbar-search-wrap")){
        hide();
      }
    };

    document.addEventListener("click", outsideClick);

    /* =========================
       CLEANUP
    ========================= */

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

})();
