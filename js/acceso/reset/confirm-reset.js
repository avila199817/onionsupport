document.addEventListener("DOMContentLoaded", () => {

  const API_URL = "https://api.onionit.net/api/auth/reset-password-confirm";

  const form = document.getElementById("confirmForm");
  if (!form) return;

  const errorBox = document.querySelector(".login-error");
  const button = form.querySelector("button[type='submit']");
  const passwordInput  = document.getElementById("password");
  const password2Input = document.getElementById("password2");
  const toastContainer = document.getElementById("toastContainer");

  const params = new URLSearchParams(window.location.search);
  const token = (params.get("token") || "").trim();

  let isSubmitting = false;

  /* =========================
     TOAST
  ========================= */
  function showToast(msg, type = "success") {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;

    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /* =========================
     UI HELPERS
  ========================= */
  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }

  function showSuccess(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }

  function setLoading(isLoading, text = "Guardando…") {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || "Guardar contraseña";
      button.disabled = false;
    }
  }

  /* =========================
     👁️ TOGGLE PASSWORD
  ========================= */
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("aria-pressed", isPassword ? "true" : "false");
      input.focus();
    });
  });

  /* =========================
     🔠 CAPS LOCK
  ========================= */
  function bindCapsLock(input) {
    const warning = document.querySelector(
      `.caps-warning[data-caps="${input.id}"]`
    );
    if (!warning) return;

    function updateCaps(e) {
      const isCaps = e.getModifierState && e.getModifierState("CapsLock");
      warning.style.display = isCaps ? "block" : "none";
    }

    input.addEventListener("keydown", updateCaps);
    input.addEventListener("keyup", updateCaps);
    input.addEventListener("blur", () => warning.style.display = "none");
  }

  bindCapsLock(passwordInput);
  bindCapsLock(password2Input);

  /* =========================
     VALIDACIÓN PASSWORD
  ========================= */
  function validatePassword(password) {
    const errors = [];

    if (password.length < 10) {
      errors.push("Debe tener al menos 10 caracteres");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Debe incluir al menos una letra mayúscula");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Debe incluir al menos una letra minúscula");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Debe incluir al menos un número");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push("Debe incluir al menos un símbolo");
    }

    return errors;
  }

  /* =========================
     TOKEN CHECK
  ========================= */
  if (!token) {
    showError("El enlace no es válido o ha caducado.");
    console.error("RESET ERROR: token vacío");
    return;
  }

  /* =========================
     SUBMIT
  ========================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    clearError();

    const password  = passwordInput.value.trim();
    const password2 = password2Input.value.trim();

    if (!password || !password2) {
      showError("Debes completar ambos campos.");
      showToast("Campos incompletos", "error");
      return;
    }

    if (password !== password2) {
      showError("Las contraseñas no coinciden.");
      showToast("Las contraseñas no coinciden", "error");
      return;
    }

    const validationErrors = validatePassword(password);

    if (validationErrors.length > 0) {
      const msg = validationErrors.join(" · ");
      showError(msg);
      showToast("Contraseña no válida", "error");
      console.error("RESET PASSWORD VALIDATION:", validationErrors);
      return;
    }

    isSubmitting = true;
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token, password })
      });

      const data = await res.json().catch(() => ({}));

      /* PASSWORD REUSED */
      if (data?.error === "PASSWORD_REUSED") {
        showError("No puedes reutilizar la misma contraseña.");
        showToast("Contraseña ya utilizada", "error");
        console.error("RESET ERROR: PASSWORD_REUSED");
        setLoading(false);
        isSubmitting = false;
        return;
      }

      /* TOKEN INVALID */
      if (data?.error === "TOKEN_INVALID") {
        showError("El enlace no es válido o ha caducado.");
        showToast("Token inválido", "error");
        console.error("RESET ERROR: TOKEN_INVALID");
        setLoading(false);
        isSubmitting = false;
        return;
      }

      /* OK */
      if (res.ok && data?.ok === true) {
        showSuccess("Contraseña cambiada correctamente.");
        showToast("Contraseña actualizada");

        setLoading(false);
        isSubmitting = false;

        setTimeout(() => {
          window.location.href = "/es/acceso/";
        }, 2500);

        return;
      }

      /* ERROR GENÉRICO */
      showError("No se pudo restablecer la contraseña.");
      showToast("Error al actualizar la contraseña", "error");
      console.error("RESET ERROR RESPONSE:", data);

      setLoading(false);
      isSubmitting = false;

    } catch (err) {
      console.error("RESET NETWORK ERROR:", err);
      showError("Error de conexión con el servidor.");
      showToast("Error de conexión", "error");
      setLoading(false);
      isSubmitting = false;
    }
  });

});