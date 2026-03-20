/* =====================================================
   ONION AUTH · ROLE CACHE
===================================================== */

(function(){

"use strict";

let cachedRole = null;

async function getRole(){

if(cachedRole) return cachedRole;

try{

const data = await fetchJSON(`${API}/auth/me`);

cachedRole = data?.user?.role || "user";

return cachedRole;

}catch(err){

console.warn("AUTH ERROR:",err);
return "user";

}

}

window.auth = {
getRole
};

})();