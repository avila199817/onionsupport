document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("resetForm");
  if (!form) return;

  const errorBox = document.querySelector(".login-error");
  const button = form.querySelector("button[type='submit']");
  const emailInput = document.getElementById("email");

  let redirectTimer = null;
  let isSubmitting = false;

  /* =========================
     TOAST
  ========================= */

  function showToast(msg, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  /* =========================
     UI HELPERS
  ========================= */

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.className = "login-error error";
    errorBox.style.display = "block";
  }

  function showSuccess(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.className = "login-error success";
    errorBox.style.display = "block";
  }

  function clearMessage() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }

  function setLoading(isLoading, text = "Enviando…") {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
      button.classList.add("btn-loading");
    } else {
      button.textContent =
        button.dataset.originalText || "Enviar enlace de recuperación";
      button.disabled = false;
      button.classList.remove("btn-loading");
    }
  }

  function redirectToLogin(delay = 2000) {
    if (redirectTimer) clearTimeout(redirectTimer);

    redirectTimer = setTimeout(() => {
      window.location.href = "/es/acceso/";
    }, delay);
  }

  /* =========================
     VALIDACIÓN EMAIL
  ========================= */

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* =========================
     SUBMIT
  ========================= */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (isSubmitting) return;
    isSubmitting = true;

    clearMessage();

    const email = emailInput?.value.trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      showError("Introduce un email válido.");
      showToast("Email no válido", "error");
      isSubmitting = false;
      return;
    }

    setLoading(true);

    try {

      const res = await fetch(
        "https://api.onionit.net/api/auth/reset-password-request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email })
        }
      );

      let data = {};
      try {
        data = await res.json();
      } catch {}

      /* =========================
         OK
      ========================= */
      if (res.ok && data.ok) {
        showSuccess("Te hemos enviado un correo para restablecer la contraseña.");
        showToast("Correo enviado correctamente");
        setLoading(false);
        isSubmitting = false;
        redirectToLogin(2000);
        return;
      }

      /* =========================
         EMAIL NO EXISTE
      ========================= */
      if (res.ok && data.ok) {
       showSuccess("Si el correo existe, recibirás un email.");
       showToast("Solicitud enviada");
       setLoading(false);
       isSubmitting = false;
       redirectToLogin(2000);
       return;
      }

      /* =========================
         ERROR GENÉRICO
      ========================= */
      showError("No se pudo procesar la solicitud.");
      showToast("Error procesando la solicitud", "error");
      setLoading(false);
      isSubmitting = false;

    } catch (err) {
      console.error("RESET PASSWORD ERROR:", err);
      showError("Error de conexión con el servidor.");
      showToast("Error de conexión", "error");
      setLoading(false);
      isSubmitting = false;
    }
  });

});