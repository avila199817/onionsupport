document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("changeEmailForm");
  if (!form) return;

  const newEmailInput     = document.getElementById("newEmail");
  const confirmEmailInput = document.getElementById("confirmEmail");
  const passwordInput     = document.getElementById("password");

  const togglePasswordBtn = document.getElementById("togglePassword");
  const capsWarning       = document.getElementById("capsWarning");

  const button   = form.querySelector("button[type='submit']");
  const errorBox = document.querySelector(".login-error");

  const token = localStorage.getItem("onion_token");

  if (!token) {
    window.location.href = "/es/acceso/";
    return;
  }

  /* =========================
     🔐 CHECK 2FA CONFIRM (5 min)
  ========================= */
  const confirmDataRaw = localStorage.getItem("onion_2fa_confirmed");

  if (confirmDataRaw) {
    try {
      const confirmData = JSON.parse(confirmDataRaw);

      if (!confirmData.expiresAt || Date.now() > confirmData.expiresAt) {
        localStorage.removeItem("onion_2fa_confirmed");
      }
    } catch {
      localStorage.removeItem("onion_2fa_confirmed");
    }
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
    errorBox.textContent = "";
    errorBox.style.display = "none";
  };

  /* =========================
     ⏳ LOADING BUTTON
  ========================= */
  const setLoading = (isLoading, text = "Actualizando…") => {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || "Cambiar correo";
      button.disabled = false;
    }
  };

  /* =========================
     👁️ TOGGLE PASSWORD (MISMO QUE RESET)
  ========================= */
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";

      togglePasswordBtn.setAttribute(
        "aria-pressed",
        isPassword ? "true" : "false"
      );

      togglePasswordBtn.classList.toggle("active");
      passwordInput.focus();
    });
  }

  /* =========================
     🔠 CAPS LOCK
  ========================= */
  let capsActive = false;
  let passwordFocused = false;

  if (capsWarning) capsWarning.style.display = "none";

  function updateCapsVisual() {
    if (!capsWarning) return;

    if (passwordFocused && capsActive) {
      capsWarning.style.display = "block";
    } else {
      capsWarning.style.display = "none";
    }
  }

  function updateCapsState(e) {
    if (!e.getModifierState) return;

    const newState = e.getModifierState("CapsLock");

    if (newState !== capsActive) {
      capsActive = newState;
      updateCapsVisual();
    }
  }

  document.addEventListener("keydown", updateCapsState);
  document.addEventListener("keyup", updateCapsState);

  passwordInput.addEventListener("focus", () => {
    passwordFocused = true;
    updateCapsVisual();
  });

  passwordInput.addEventListener("blur", () => {
    passwordFocused = false;
    updateCapsVisual();
  });

  /* =========================
     📧 VALIDACIÓN EMAIL
  ========================= */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* =========================
     🚀 SUBMIT FORM
  ========================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const newEmail     = newEmailInput.value.trim().toLowerCase();
    const confirmEmail = confirmEmailInput.value.trim().toLowerCase();
    const password     = passwordInput.value;

    if (!isValidEmail(newEmail)) {
      showError("Correo inválido");
      return;
    }

    if (newEmail !== confirmEmail) {
      showError("Los correos no coinciden");
      return;
    }

    if (!password) {
      showError("Introduce tu contraseña");
      return;
    }

    setLoading(true);

    try {

      const res = await fetch(
        "https://api.onionit.net/api/users/change-email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            newEmail,
            password
          })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        if (json?.error === "INVALID_PASSWORD") {
          throw new Error("PASSWORD");
        }
        if (json?.error === "EMAIL_IN_USE") {
          throw new Error("EMAIL_USED");
        }
        throw new Error("GENERIC");
      }

      /* 🔐 LIMPIAR CONFIRMACIÓN 2FA */
      localStorage.removeItem("onion_2fa_confirmed");

      /* 🔄 ACTUALIZAR CACHE LOCAL */
      localStorage.setItem("onion_user_email", newEmail);

      /* 🔁 REDIRECT PANEL */
      window.location.href =
        "/es/acceso/admin/cuenta/?email=updated";

    } catch (err) {
      console.error("CHANGE EMAIL ERROR:", err);

      if (err.message === "PASSWORD") {
        showError("Contraseña incorrecta");
      } else if (err.message === "EMAIL_USED") {
        showError("Ese correo ya está en uso");
      } else {
        showError("No se pudo actualizar el correo");
      }

    } finally {
      setLoading(false);
    }

  });

});