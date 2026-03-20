document.addEventListener("DOMContentLoaded", () => {

  const API_URL = "https://api.onionit.net/api/auth/change-password";

  const form = document.getElementById("changePasswordForm");
  if (!form) return;

  const button = form.querySelector("button[type='submit']");
  const errorBox = document.querySelector(".login-error");

  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const toggleNew = document.getElementById("toggleNewPassword");
  const toggleConfirm = document.getElementById("toggleConfirmPassword");

  const capsWarning = document.getElementById("capsWarning");

  let capsActive = false;
  let passwordFocused = false;
  let isSubmitting = false;

  if (capsWarning) capsWarning.style.display = "none";

  /* =========================
     👁️ TOGGLE PASSWORD
  ========================= */
  function setupToggle(toggleBtn, input) {
    if (!toggleBtn || !input) return;

    toggleBtn.addEventListener("click", () => {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      toggleBtn.classList.toggle("active");
      toggleBtn.setAttribute("aria-pressed", isHidden ? "true" : "false");
      input.focus();
    });
  }

  setupToggle(toggleNew, newPasswordInput);
  setupToggle(toggleConfirm, confirmPasswordInput);

  /* =========================
     🔠 CAPS LOCK DETECCIÓN
  ========================= */
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

  [newPasswordInput, confirmPasswordInput].forEach(input => {
    if (!input) return;

    input.addEventListener("focus", () => {
      passwordFocused = true;
      updateCapsVisual();
    });

    input.addEventListener("blur", () => {
      passwordFocused = false;
      updateCapsVisual();
    });
  });

  /* =========================
     ❌ ERROR HELPERS
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

  const setLoading = (state) => {
    if (!button) return;

    if (state) {
      button.dataset.originalText = button.textContent;
      button.textContent = "Actualizando…";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || "Cambiar contraseña";
      button.disabled = false;
    }
  };

  /* =========================
     🔐 VALIDACIÓN PASSWORD FUERTE
  ========================= */
  function validatePassword(pw) {
    if (pw.length < 10) return "Mínimo 10 caracteres";

    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);

    if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      return "Debe incluir mayúsculas, minúsculas, números y símbolo";
    }

    return null;
  }

  /* =========================
     🚀 SUBMIT CHANGE PASSWORD
  ========================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    hideError();

    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!newPassword || !confirmPassword) {
      showError("Completa todos los campos.");
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      showError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      showError("Las contraseñas no coinciden.");
      return;
    }

    const token = localStorage.getItem("onion_token");
    if (!token) {
      window.location.href = "/es/acceso/";
      return;
    }

    isSubmitting = true;
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          newPassword
        })
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error("CHANGE_PASSWORD_FAILED");
      }

      /* 🔐 logout global (tokenVersion backend) */
      localStorage.removeItem("onion_token");

      /* 🔁 redirigir a login con flag */
      window.location.href = "/es/acceso/?passwordChanged=1";

    } catch (err) {
      console.error("CHANGE PASSWORD ERROR:", err);
      showError("No se pudo cambiar la contraseña.");
    } finally {
      setLoading(false);
      isSubmitting = false;
    }
  });

});