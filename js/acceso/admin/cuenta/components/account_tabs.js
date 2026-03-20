document.addEventListener("DOMContentLoaded", async () => {

  /* =========================
     CONFIG
  ========================= */
  const token = localStorage.getItem("onion_token");
  if (!token) {
    location.href = "/es/acceso/";
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  /* =========================
     FETCH JSON HELPER
  ========================= */
  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("onion_token");
      location.href = "/es/acceso/";
      return;
    }

    let json = null;
    try { json = await res.json(); } catch {}

    if (!res.ok) {
      throw new Error(json?.error || "Error de servidor");
    }

    return json;
  }

  /* =========================
     DATA-HREF BUTTONS (GLOBAL)
  ========================= */
  document.querySelectorAll("[data-href]").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.href;
      if (url) window.location.href = url;
    });
  });

  /* =========================
     SIDEBAR ACTIVE TAB
  ========================= */
  const currentPath = window.location.pathname;

  document.querySelectorAll("[data-tab]").forEach(tab => {
    const tabPath = tab.dataset.tab;

    if (currentPath.includes(tabPath)) {
      tab.classList.add("active");
    }
  });

  /* =========================
     CARGAR USUARIO
  ========================= */
  let user = null;

  try {
    const json = await fetchJSON(
      "https://api.onionit.net/api/auth/me",
      { headers }
    );

    user = json?.user || null;

  } catch (err) {
    console.error("USER LOAD ERROR:", err);
  }

  if (!user) return;

  /* =========================
     PINTAR EMAIL
  ========================= */
  const emailEl = document.getElementById("cardUserEmail");
  if (emailEl) {
    emailEl.textContent = user.email || "—";
  }

  /* =========================
     PINTAR FECHA PASSWORD
  ========================= */
  const pwdEl = document.getElementById("lastPasswordChangeText");

  if (pwdEl) {
    if (user.lastPasswordChangeAt) {
      pwdEl.textContent =
        "Último cambio: " + formatearFecha(user.lastPasswordChangeAt);
    } else {
      pwdEl.textContent = "Último cambio: —";
    }
  }

  /* =========================
     HELPERS
  ========================= */
  function formatearFecha(fechaISO) {
    try {
      const fecha = new Date(fechaISO);

      return fecha.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

    } catch {
      return "—";
    }
  }

});