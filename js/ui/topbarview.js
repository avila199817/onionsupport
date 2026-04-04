/* =========================
   MINI TOPBAR HEIGHT AUTO
========================= */

(function(){

  function setMiniTopbarHeight(){

    const mini = document.querySelector('.mini-topbar');
    if(!mini) return;

    const height = mini.offsetHeight;

    document.documentElement.style.setProperty(
      '--mini-topbar-height',
      height + 'px'
    );

  }

  // 🔥 Inicial
  window.addEventListener('load', setMiniTopbarHeight);

  // 🔥 Resize (responsive)
  window.addEventListener('resize', setMiniTopbarHeight);

  // 🔥 Por si cambia dinámicamente (filters, etc)
  const observer = new ResizeObserver(setMiniTopbarHeight);

  const mini = document.querySelector('.mini-topbar');
  if(mini){
    observer.observe(mini);
  }

})();
