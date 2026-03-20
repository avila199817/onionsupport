(function(){

"use strict";

/* =====================================================
   ONION BADGE ENGINE · PRO
===================================================== */


/* =====================================================
   MAPS
===================================================== */

const STATUS = {

open:{ label:"Abierta", class:"badge badge-open badge-dot" },
pending:{ label:"Pendiente", class:"badge badge-pending badge-dot" },
closed:{ label:"Cerrada", class:"badge badge-closed" }

};

const ROLE = {

admin:{ label:"Admin", class:"badge badge-admin" },
user:{ label:"User", class:"badge badge-user" }

};

const TYPE = {

empresa:{ label:"Empresa", class:"badge badge-empresa" },
particular:{ label:"Particular", class:"badge badge-particular" }

};

const ACTIVE = {

true:{ label:"Activo", class:"badge badge-activo badge-dot" },
false:{ label:"Inactivo", class:"badge badge-inactivo" }

};


/* =====================================================
   UTILS
===================================================== */

function normalize(value){

if(value === null || value === undefined) return "";

return String(value).toLowerCase().trim();

}

function escapeHTML(str){

return String(str)
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#39;");

}


/* =====================================================
   RENDER
===================================================== */

function render(map,value,custom){

const key = normalize(value);

const data = map[key] || custom;

if(!data){

return `<span class="badge badge-neutral">${
escapeHTML(value ?? "-")
}</span>`;

}

return `<span class="${data.class}">${
escapeHTML(data.label)
}</span>`;

}


/* =====================================================
   PUBLIC API
===================================================== */

window.badge = {

status(v,custom){
return render(STATUS,v,custom);
},

role(v,custom){
return render(ROLE,v,custom);
},

type(v,custom){
return render(TYPE,v,custom);
},

active(v,custom){
return render(ACTIVE,v,custom);
},

/* uso libre */
custom(map,v){
return render(map,v);
}

};

})();