document.addEventListener("DOMContentLoaded", async () => {

  Onion.log("🚀 BOOT INIT");

  try{

    Onion.state.slug = localStorage.getItem("onion_user_slug");

    if(!Onion.state.slug){
      Onion.warn("No slug → redirect login");
      Onion.auth.redirectLogin();
      return;
    }

    // 🔥 SOLO INIT
    await Onion.init();

    Onion.log("✅ APP READY");

  }catch(e){

    Onion.error("💥 BOOT ERROR:", e);

  }

});
