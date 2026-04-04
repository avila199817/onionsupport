/* =========================================================
   MINI TOPBAR HEIGHT AUTO — PRO SPA FIX (10/10)
========================================================= */

(function(){

  let observer = null;
  let rafId = null;

  function setMiniTopbarHeight(){

    const mini = document.querySelector('.mini-topbar');

    if(!mini){
      document.documentElement.style.setProperty('--mini-topbar-height', '0px');
      return;
    }

    const height = mini.offsetHeight || 0;

    document.documentElement.style.setProperty(
      '--mini-topbar-height',
      height + 'px'
    );
  }

  function measure(){

    // 🔥 cancela RAF anterior (evita spam en SPA)
    if(rafId){
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(()=>{
      requestAnimationFrame(setMiniTopbarHeight);
    });
  }

  function init(){

    const mini = document.querySelector('.mini-topbar');

    if(!mini){
      setMiniTopbarHeight();
      return;
    }

    measure();

    // 🔥 limpiar observer previo
    if(observer){
      observer.disconnect();
      observer = null;
    }

    // 🔥 ResizeObserver PRO (con debounce natural)
    if(window.ResizeObserver){
      observer = new ResizeObserver(()=>{
        measure();
      });

      observer.observe(mini);
    }

  }

  /* =========================
     🔥 HOOK SPA (SIN ROMPER RENDER)
  ========================= */

  if(window.Onion && !Onion.__miniTopbarHooked){

    Onion.__miniTopbarHooked = true;

    const originalRender = Onion.render;

    Onion.render = async function(){

      const result = await originalRender.apply(this, arguments);

      measure();

      return result;
    };

  }else{
    window.addEventListener('load', measure);
  }

  /* =========================
     CLEANUP
  ========================= */

  if(window.Onion){
    Onion.onCleanup(()=>{
      if(observer){
        observer.disconnect();
        observer = null;
      }

      if(rafId){
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }

})();
