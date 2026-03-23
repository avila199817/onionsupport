document.addEventListener("DOMContentLoaded", () => {

const form = document.getElementById("loginForm");
if (!form) return;

const card = document.getElementById("loginCard");

const button = form.querySelector("button[type='submit']");
const errorBox = document.getElementById("loginError");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

const toggleBtn = document.getElementById("togglePassword");
const capsIcon = document.getElementById("capsIcon");

const logoContainer = document.querySelector(".logo-fade");
const logos = logoContainer ? logoContainer.querySelectorAll("img") : [];

let capsActive = false;
let passwordFocused = false;

if (capsIcon) capsIcon.style.display = "none";

/* =========================
   API CONFIG 🔥
========================= */

const API = window.location.origin.includes("localhost")
  ? "http://localhost:8080"
  : "https://api.onionit.net";

/* =========================
   AUTOFOCUS USERNAME
========================= */

if (usernameInput) {
  usernameInput.focus();
}

/* =========================
   SLUGIFY USER
========================= */

function slugify(name){
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"-")
    .toLowerCase();
}

/* =========================
   LOGO FADE
========================= */

if (logos.length > 1){

  let index = 0;

  logos.forEach((img,i)=>{
    img.style.opacity = i === 0 ? "1" : "0";
    img.style.transition = "opacity 1.8s ease";
  });

  const interval = setInterval(()=>{

    const current = logos[index];
    const next = logos[index+1];

    if(!next){

      clearInterval(interval);

      logos.forEach((img,i)=>{
        img.style.opacity = i === logos.length-1 ? "1" : "0";
      });

      return;
    }

    current.style.opacity = "0";
    next.style.opacity = "1";

    index++;

  },3000);

}

/* =========================
   SHAKE LOGIN
========================= */

function shakeLogin(){

  if(!card) return;

  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");

}

/* =========================
   PASSWORD TOGGLE
========================= */

if (toggleBtn && passwordInput){

  toggleBtn.addEventListener("click",()=>{

    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    toggleBtn.classList.toggle("active");

    toggleBtn.setAttribute(
      "aria-pressed",
      isHidden ? "true" : "false"
    );

    passwordInput.focus();

  });

}

/* =========================
   CAPS LOCK
========================= */

function updateCapsVisual(){

  if(!capsIcon) return;

  if(passwordFocused && capsActive){
    capsIcon.style.display = "block";
  }else{
    capsIcon.style.display = "none";
  }

}

function updateCapsState(e){

  if(!e.getModifierState) return;

  const newState = e.getModifierState("CapsLock");

  if(newState !== capsActive){
    capsActive = newState;
    updateCapsVisual();
  }

}

document.addEventListener("keydown", updateCapsState);
document.addEventListener("keyup", updateCapsState);

if(passwordInput){

  passwordInput.addEventListener("focus",()=>{
    passwordFocused = true;
    updateCapsVisual();
  });

  passwordInput.addEventListener("blur",()=>{
    passwordFocused = false;
    updateCapsVisual();
  });

}

/* =========================
   ERROR HELPERS
========================= */

function showError(msg){

  if(!errorBox) return;

  errorBox.textContent = msg;
  errorBox.style.display = "block";

  shakeLogin();

  if(passwordInput){
    passwordInput.value="";
    passwordInput.focus();
  }

}

function hideError(){

  if(!errorBox) return;

  errorBox.style.display = "none";

}

/* =========================
   LOGIN SUBMIT (JWT 🔥)
========================= */

form.addEventListener("submit", async (e)=>{

  e.preventDefault();

  hideError();

  const identifier = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if(!identifier || !password){
    showError("Introduce usuario y contraseña.");
    return;
  }

  button.disabled = true;
  button.textContent = "Accediendo…";

  try{

    const res = await fetch(
      `${API}/api/auth/login`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          identifier,
          password
        })
      }
    );

    const json = await res.json().catch(()=>({}));

    /* ERROR LOGIN */

    if(!res.ok || !json.ok){
      throw new Error("INVALID_LOGIN");
    }

    const user = json.user || {};

    const slug = user.slug || slugify(
      user.username || user.name || identifier
    );

    /* =========================
       2FA PRIMERO 🔥
    ========================== */

    if(json.requires2FA && json.tempToken){

      localStorage.setItem(
        "onion_temp_token",
        json.tempToken
      );

      window.location.href = "/es/acceso/2fa/";
      return;
    }

    /* =========================
       TOKEN NORMAL
    ========================== */

    if(json.token){
      localStorage.setItem("onion_token", json.token);
    }

    localStorage.setItem("onion_user_slug", slug);
    localStorage.setItem("onion_user_name", user.name || "");
    localStorage.setItem("onion_role", user.role || "user");

    /* =========================
       LOGIN OK
    ========================== */

    window.location.href = "/@" + slug;

  }catch(err){

    console.error("LOGIN ERROR:",err);
    showError("Usuario o contraseña incorrectos.");

  }finally{

    button.disabled = false;
    button.textContent = "Acceder";

  }

});

});
