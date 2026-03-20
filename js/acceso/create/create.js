document.addEventListener("DOMContentLoaded", () => {

  const API_BASE = "https://api.onionit.net";

  const form = document.getElementById("activateForm");
  if (!form) return;

  const errorBox = document.querySelector(".login-error");
  const button = form.querySelector("button[type='submit']");
  const passwordInput  = document.getElementById("password");
  const password2Input = document.getElementById("password2");
  const toastContainer = document.getElementById("toastContainer");

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    showError("Enlace de activación no válido o incompleto.");
    return;
  }

  /* =========================
     UI HELPERS
  ========================= */

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }

  function setLoading(isLoading, text = "Activando…") {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || "Activar cuenta";
      button.disabled = false;
    }
  }

  function showToast(message, type = "success") {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  /* =========================
     🔐 PASSWORD RULES
  ========================= */

  function validatePassword(password) {
    if (password.length < 10) {
      return "Debe tener al menos 10 caracteres.";
    }
    if (!/[A-Z]/.test(password)) {
      return "Debe contener al menos una letra mayúscula.";
    }
    if (!/[a-z]/.test(password)) {
      return "Debe contener al menos una letra minúscula.";
    }
    if (!/[0-9]/.test(password)) {
      return "Debe contener al menos un número.";
    }
    if (!/[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\\/]/.test(password)) {
      return "Debe contener al menos un símbolo.";
    }
    return null;
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
     🔠 CAPS LOCK DETECTION
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

  if (passwordInput)  bindCapsLock(passwordInput);
  if (password2Input) bindCapsLock(password2Input);

  /* =========================
     SUBMIT
  ========================= */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const password  = passwordInput.value.trim();
    const password2 = password2Input.value.trim();

    if (!password || !password2) {
      showError("Debes completar ambos campos.");
      return;
    }

    if (password !== password2) {
      showError("Las contraseñas no coinciden.");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      console.error("❌ PASSWORD INVALIDA:", passwordError);
      showError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/auth/activate/first-user/activar-cuenta`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ token, password })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        console.error("❌ ACTIVAR ERROR BACKEND:", data);
        setLoading(false);
        showToast(
          data?.message ||
          "No se pudo activar la cuenta. El enlace puede haber caducado.",
          "error"
        );
        return;
      }

      showToast("Cuenta activada correctamente", "success");

      setTimeout(() => {
        window.location.href = "/es/acceso/";
      }, 2000);

    } catch (err) {
      console.error("❌ ACTIVAR ERROR NETWORK:", err);
      setLoading(false);
      showToast("Error de conexión. Inténtalo de nuevo.", "error");
    }
  });

});