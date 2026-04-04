/* =========================
   MINI TOPBAR HEIGHT AUTO (PRO)
========================= */

(function(){

  let observer = null;

  function setMiniTopbarHeight(){

    const mini = document.querySelector('.mini-topbar');

    if(!mini){
      document.documentElement.style.setProperty('--mini-topbar-height', '0px');
      return;
    }

    const height = mini.offsetHeight;

    document.documentElement.style.setProperty(
      '--mini-topbar-height',
      height + 'px'
    );
  }

  function init(){

    const mini = document.querySelector('.mini-topbar');

    // 🔥 primera medición
    setMiniTopbarHeight();

    // 🔥 limpiar observer anterior (SPA safe)
    if(observer){
      observer.disconnect();
      observer = null;
    }

    // 🔥 observar cambios reales de tamaño
    if(mini && window.ResizeObserver){
      observer = new ResizeObserver(setMiniTopbarHeight);
      observer.observe(mini);
    }
  }

  /* =========================
     INIT FLOW
  ========================= */

  // 🔥 DOM listo
  document.addEventListener('DOMContentLoaded', init);

  // 🔥 fallback por si cargas dinámico (Onion / SPA)
  setTimeout(init, 100);
  setTimeout(init, 300);

  // 🔥 responsive
  window.addEventListener('resize', setMiniTopbarHeight);

  /* =========================
     CLEANUP (Onion SPA)
  ========================= */

  if(window.Onion){
    Onion.onCleanup(()=>{
      if(observer){
        observer.disconnect();
        observer = null;
      }
    });
  }

})();
