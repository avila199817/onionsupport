/* =========================
   MINI TOPBAR HEIGHT AUTO (FIX REAL SPA)
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
    if(!mini) return;

    // 🔥 medir después de pintar
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        setMiniTopbarHeight();
      });
    });

    // 🔥 limpiar observer anterior
    if(observer){
      observer.disconnect();
      observer = null;
    }

    // 🔥 observar cambios reales
    if(window.ResizeObserver){
      observer = new ResizeObserver(setMiniTopbarHeight);
      observer.observe(mini);
    }

  }

  /* =========================
     🔥 CLAVE: HOOK EN RENDER
  ========================= */

  if(window.Onion){

    const originalRender = Onion.render;

    Onion.render = async function(){

      await originalRender.apply(this, arguments);

      // 🔥 esperar a que DOM esté listo
      requestAnimationFrame(()=>{
        init();
      });

    };

  }else{
    // fallback normal
    window.addEventListener('load', init);
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
    });
  }

})();
