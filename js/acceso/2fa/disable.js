document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("disable2faForm");
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
     🔢 INPUT BOXES
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
     🚀 SUBMIT DISABLE 2FA
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
    button.textContent = "Desactivando…";

    try {

      const res = await fetch(
        "https://api.onionit.net/api/auth/2fa/disable",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            code,
            password: document.getElementById("password")?.value || ""
          })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error("INVALID_CODE");
      }

      /* 🔐 Logout tras desactivar */
      localStorage.removeItem("onion_token");

      window.location.href = "/es/acceso/?2fa=disabled";

    } catch (err) {
      console.error("2FA DISABLE ERROR:", err);
      showError("Código incorrecto");

      boxes.forEach(b => b.value = "");
      hiddenInput.value = "";
      boxes[0].focus();

    } finally {
      button.disabled = false;
      button.textContent = "Desactivar";
    }

  });

});