/* =====================================================
   PORTAL ANIMATION · ULTRA PRO
===================================================== */

const portal = document.querySelector(".portal");
if(!portal) return;

const icons = portal.querySelectorAll(".portal-icon");
const cloud = portal.querySelector(".portal-cloud");

const textElements = portal.querySelectorAll(
".portal-header h2, .portal-header p"
);

const logos = portal.querySelectorAll(".logos-strip .cloud-logo");


/* =====================================================
   STATE
===================================================== */

const state = {

currentProgress:0,
targetProgress:0,

lerpFactor:0.08

};


/* =====================================================
   CACHE SPHERE DATA
===================================================== */

const iconData = Array.from(icons).map(icon=>{

return{

el:icon,

x:parseFloat(getComputedStyle(icon).getPropertyValue("--x"))||0,
y:parseFloat(getComputedStyle(icon).getPropertyValue("--y"))||0

};

});


/* =====================================================
   SCROLL DETECTION
===================================================== */

window.addEventListener("scroll",()=>{

const rect = portal.getBoundingClientRect();

const windowHeight = window.innerHeight;

let progress = (windowHeight - rect.top) / (windowHeight * 0.9);

state.targetProgress = Math.max(0,Math.min(1,progress));

},{passive:true});


/* =====================================================
   RENDER LOOP
===================================================== */

function render(){

state.currentProgress +=
(state.targetProgress - state.currentProgress) * state.lerpFactor;

const p = state.currentProgress;

const ease = Math.pow(p,2.4);


/* =====================================================
   SPHERES ANIMATION
===================================================== */

iconData.forEach(icon=>{

const moveX = icon.x * (1 - ease);
const moveY = icon.y * (1 - ease);

const scale = 1 + ease * 0.25;

let opacity = Math.min(p * 4,1);

/* FADE OUT CUANDO SE JUNTAN */

if(ease > 0.75){
opacity = 1 - (ease - 0.75) * 4;
}

icon.el.style.transform =
`translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px)) scale(${scale})`;

icon.el.style.opacity = opacity;

});


/* =====================================================
   CENTRAL CLOUD
===================================================== */

if(cloud){

const cloudScale = 1 + ease * 0.35;

cloud.style.transform =
`translate(-50%,-50%) scale(${cloudScale})`;

cloud.style.opacity = Math.min(p * 2,1);

}


/* =====================================================
   TEXT APPEAR
===================================================== */

const textAlpha = Math.max(0,(p - 0.55) * 3);

textElements.forEach(el=>{

el.style.opacity = textAlpha;

el.style.transform =
`translateY(${18 * (1 - textAlpha)}px)`;

});


/* =====================================================
   LOGOS APPEAR
===================================================== */

logos.forEach((logo,index)=>{

const delay = index * 0.12;

const logoProgress = Math.max(
0,
Math.min(1,(p - 0.65 - delay) * 3)
);

logo.style.opacity = logoProgress;

logo.style.transform =
`translateY(${20 * (1 - logoProgress)}px) scale(${0.95 + logoProgress * 0.05})`;

});


requestAnimationFrame(render);

}


/* =====================================================
   START LOOP
===================================================== */

render();