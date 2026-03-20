document.addEventListener("DOMContentLoaded", async () => {

  const title      = document.getElementById("verifyTitle");
  const subtitle   = document.getElementById("verifySubtitle");
  const iconBox    = document.getElementById("verifyIcon");
  const messageBox = document.getElementById("verifyMessage");
  const button     = document.getElementById("verifyButton");

  /* =========================
     GET TOKEN
  ========================= */
  const params = new URLSearchParams(window.location.search);
  const token  = params.get("token");

  if (!token) {
    showError("Enlace inválido o incompleto.");
    return;
  }

  /* =========================
     VERIFY REQUEST
  ========================= */
  try {

    const res = await fetch(
      "https://api.onionit.net/api/users/verify-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "VERIFY_FAILED");
    }

    showSuccess();

  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);

    if (err.message === "TOKEN_EXPIRED") {
      showError("El enlace ha caducado.");
    } else if (err.message === "TOKEN_INVALID") {
      showError("El enlace no es válido.");
    } else {
      showError("No se pudo verificar el correo.");
    }
  }

  /* =========================
     SUCCESS UI
  ========================= */
  function showSuccess() {

    title.textContent = "Correo verificado";
    subtitle.textContent = "Tu correo ha sido confirmado correctamente.";

    iconBox.innerHTML = `
      <div class="verify-success">✓</div>
    `;

    messageBox.textContent =
      "Ya puedes acceder con tu nueva dirección de correo.";

    button.textContent = "Ir al panel";
    button.style.display = "block";

    button.addEventListener("click", () => {
      window.location.href = "/es/acceso/admin/cuenta/";
    });

    // Auto redirect opcional (3s)
    setTimeout(() => {
      window.location.href = "/es/acceso/admin/cuenta/?email=verified";
    }, 3000);
  }

  /* =========================
     ERROR UI
  ========================= */
  function showError(msg) {

    title.textContent = "Verificación fallida";
    subtitle.textContent = "No hemos podido validar el enlace.";

    iconBox.innerHTML = `
      <div class="verify-error">!</div>
    `;

    messageBox.textContent = msg;

    button.textContent = "Volver al panel";
    button.style.display = "block";

    button.addEventListener("click", () => {
      window.location.href = "/es/acceso/admin/cuenta/";
    });
  }

});