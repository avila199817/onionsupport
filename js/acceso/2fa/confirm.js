document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("confirm2faForm");
  if (!form) return;

  const boxes = document.querySelectorAll(".code-box");
  const hiddenInput = document.getElementById("code");

  const button = form.querySelector("button[type='submit']");
  const errorBox = document.querySelector(".login-error");

  const token = localStorage.getItem("onion_token");

  if (!token) {
    window.location.href = "/es/acceso/";
    return;
  }

  /* =========================
     ❌ ERROR UI
  ========================= */
  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  };

  const hideError = () => {
    if (!errorBox) return;
    errorBox.style.display = "none";
  };

  /* =========================
     🔢 UPDATE HIDDEN INPUT
  ========================= */
  const updateHidden = () => {
    hiddenInput.value = Array.from(boxes).map(b => b.value).join("");
  };

  /* =========================
     🔢 INPUT CAJAS
  ========================= */
  boxes.forEach((box, index) => {

    box.addEventListener("input", (e) => {
      hideError();

      const value = e.target.value.replace(/\D/g, "");
      e.target.value = value;

      if (value && index < boxes.length - 1) {
        boxes[index + 1].focus();
      }

      updateHidden();
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && index > 0) {
        boxes[index - 1].focus();
      }
    });

    box.addEventListener("paste", (e) => {
      e.preventDefault();
      hideError();

      const paste = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);

      paste.split("").forEach((num, i) => {
        if (boxes[i]) boxes[i].value = num;
      });

      boxes[Math.min(paste.length, 5)].focus();
      updateHidden();
    });
  });

  if (boxes[0]) boxes[0].focus();

  /* =========================
     🚀 SUBMIT CONFIRM 2FA
  ========================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const code = hiddenInput.value;

    if (!code || code.length !== 6) {
      showError("Código inválido");
      return;
    }

    button.disabled = true;
    button.textContent = "Verificando…";

    try {

      const res = await fetch(
        "https://api.onionit.net/api/auth/2fa/confirm",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ code })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error("INVALID_CODE");
      }

      /* 🔐 CONFIRMACIÓN TEMPORAL (5 MIN) */
      const expiresAt = Date.now() + (5 * 60 * 1000);

      localStorage.setItem(
        "onion_2fa_confirmed",
        JSON.stringify({ expiresAt })
      );

      /* =========================
         🔁 REDIRECT SEGÚN ACTION
      ========================= */
      const params = new URLSearchParams(window.location.search);
      const action = params.get("action");

      if (action === "change_email") {

        window.location.href =
          "/es/acceso/admin/cuenta/seguridad/change_email/";

      } else if (action === "change_phone") {

        window.location.href =
          "/es/acceso/admin/cuenta/seguridad/change_phone/";

      } else if (action === "change_password") {

        window.location.href =
          "/es/acceso/admin/cuenta/seguridad/change_password/";

      } else if (action === "change_name") {

        window.location.href =
          "/es/acceso/admin/cuenta/seguridad/change_name/";

      } else {

        window.location.href =
          "/es/acceso/admin/cuenta/seguridad/";

      }

    } catch (err) {

      console.error("2FA CONFIRM ERROR:", err);
      showError("Código incorrecto");

      boxes.forEach(b => b.value = "");
      hiddenInput.value = "";
      boxes[0].focus();

    } finally {

      button.disabled = false;
      button.textContent = "Confirmar";

    }

  });

});