function initPrivacy(user){

  const toggle = document.getElementById("toggle-privacy");

  if(!toggle) return;

  const enabled = !!user.privacyMode;

  /* sincronizar toggle con BD */

  toggle.checked = enabled;

  applyPrivacy(enabled);

  toggle.addEventListener("change",savePrivacy);

}



function applyPrivacy(enabled){

  document.body.classList.toggle("privacy-hidden",enabled);

  localStorage.setItem(
    "privacy-mode",
    enabled ? "on":"off"
  );

}



async function savePrivacy(){

  const enabled = this.checked;

  applyPrivacy(enabled);

  try{

    await fetch(`${API}/user/preferences/privacy`,{
      method:"PATCH",
      headers:getHeaders(),
      body:JSON.stringify({privacyMode:enabled})
    });

  }catch(err){

    console.error("Error guardando privacidad",err);

    /* rollback UI si falla */

    this.checked = !enabled;

    applyPrivacy(!enabled);

  }

}