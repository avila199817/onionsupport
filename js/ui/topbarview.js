/* =========================
   MINI TOPBAR HEIGHT AUTO (FINAL PRO)
========================= */

(function(){

  let observer = null;
  let initialized = false;

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
    if(!mini) return;

    // 🔥 evitar doble init en SPA
    if(initialized) return;
    initialized = true;

    // 🔥 primera medición
    requestAnimationFrame(()=>{
      setMiniTopbarHeight();
    });

    // 🔥 limpiar observer previo
    if(observer){
      observer.disconnect();
      observer = null;
    }

    // 🔥 observar cambios reales (filters, responsive, etc)
    if(window.ResizeObserver){
      observer = new ResizeObserver(()=>{
        setMiniTopbarHeight();
      });

      observer.observe(mini);
    }

  }

  /* =========================
     INIT FLOW
  ========================= */

  // 🔥 DOM listo
  document.addEventListener('DOMContentLoaded', init);

  // 🔥 SPA / render dinámico (clave real)
  window.addEventListener('load', init);

  // 🔥 resize global
  window.addEventListener('resize', setMiniTopbarHeight);

  // 🔥 reintento ligero por si render tarda
  setTimeout(init, 150);

  /* =========================
     CLEANUP (Onion SPA)
  ========================= */

  if(window.Onion){
    Onion.onCleanup(()=>{

      if(observer){
        observer.disconnect();
        observer = null;
      }

      initialized = false;

      document.documentElement.style.setProperty('--mini-topbar-height', '0px');

    });
  }

})();
