document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("form2FA");
  if (!form) return;

  const errorBox = document.querySelector(".login-error");
  const hiddenInput = document.getElementById("code");
  const boxes = document.querySelectorAll(".code-box");
  const submitBtn = form.querySelector("button[type='submit']");

  const tempToken = localStorage.getItem("onion_temp_token");

  if (!tempToken) {
    window.location.href = "/es/acceso/";
    return;
  }

  /* =========================
     ERROR UI
  ========================= */

  function showError(msg){
    if(!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }

  function hideError(){
    if(!errorBox) return;
    errorBox.style.display = "none";
  }

  /* =========================
     GET CODE
  ========================= */

  function getCode(){
    return Array.from(boxes)
      .map(b => b.value.replace(/\D/g,""))
      .join("");
  }

  function updateHidden(){
    if(hiddenInput){
      hiddenInput.value = getCode();
    }
  }

  /* =========================
     FOCUS HELPERS
  ========================= */

  function focusNext(index){
    if(index < boxes.length - 1){
      boxes[index + 1].focus();
    }
  }

  function focusPrev(index){
    if(index > 0){
      boxes[index - 1].focus();
    }
  }

  /* =========================
     INPUT HANDLING
  ========================= */

  boxes.forEach((box,index)=>{

    box.setAttribute("maxlength","1");

    box.addEventListener("input",(e)=>{

      hideError();

      let value = e.target.value.replace(/\D/g,"");

      if(value.length > 1){
        value = value[0];
      }

      e.target.value = value;

      if(value){
        focusNext(index);
      }

      updateHidden();

    });

    box.addEventListener("keydown",(e)=>{

      if(e.key === "Backspace" && !box.value){
        focusPrev(index);
      }

      if(e.key === "ArrowLeft"){
        focusPrev(index);
      }

      if(e.key === "ArrowRight"){
        focusNext(index);
      }

    });

    box.addEventListener("paste",(e)=>{

      e.preventDefault();
      hideError();

      const paste = e.clipboardData
        .getData("text")
        .replace(/\D/g,"")
        .slice(0, boxes.length);

      paste.split("").forEach((num,i)=>{
        if(boxes[i]){
          boxes[i].value = num;
        }
      });

      updateHidden();

      const focusIndex = Math.min(paste.length, boxes.length - 1);
      boxes[focusIndex].focus();

    });

  });

  if(boxes[0]){
    boxes[0].focus();
  }

  /* =========================
     SUBMIT 2FA
  ========================= */

  form.addEventListener("submit", async (e)=>{

    e.preventDefault();
    hideError();

    const code = getCode();

    if(!code || code.length !== 6){
      showError("Introduce un código válido.");
      return;
    }

    submitBtn.disabled = true;

    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Verificando código…";

    try{

      const res = await fetch(
        "https://api.onionit.net/api/auth/2fa/login",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${tempToken}`
          },
          body:JSON.stringify({code})
        }
      );

      const json = await res.json().catch(()=>({}));

      if(!res.ok || !json.ok || !json.token){
        throw new Error("INVALID_CODE");
      }

      /* =========================
         TOKEN OK
      ========================= */

      localStorage.setItem("onion_token", json.token);
      localStorage.removeItem("onion_temp_token");

      window.location.href = "/es/acceso/admin/";

    }catch(err){

      console.error("2FA ERROR:",err);

      submitBtn.disabled = false;
      submitBtn.textContent = originalText;

      showError("Código incorrecto o expirado.");

      boxes.forEach(b => b.value = "");
      if(hiddenInput) hiddenInput.value = "";

      boxes[0].focus();

    }

  });

});