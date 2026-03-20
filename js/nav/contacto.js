window.addEventListener("load", () => {

  const API_URL =
    "https://api.onionit.net/contacto";

  /* =========================
     MODAL
  ========================= */
  const openBtn = document.querySelector(".contact-open");
  const modal = document.getElementById("contactModal");
  const closeBtn = document.querySelector(".contact-modal-close");
  const backdrop = document.querySelector(".contact-modal-backdrop");

  const openModal = () => {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  };

  if (openBtn && modal) {
    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeModal();
    });
  }

  /* =========================
     LOGO FADE
  ========================= */
  const logoBg = document.querySelector(".contact-logo-bg");
  if (logoBg) {
    setTimeout(() => {
      logoBg.style.opacity = "0.1";
    }, 2000);
  }

  /* =========================
     FORM
  ========================= */
  const form = document.getElementById("contactForm");
  if (!form) return;

  const submitBtn = form.querySelector("button[type='submit']");

  const tipoRadios = form.querySelectorAll("input[name='tipo']");
  const cifGroup = document.getElementById("cifGroup");
  const cifInput = form.querySelector("#cif");

  /* =========================
     TOGGLES UI
  ========================= */
  const updateEmpresaUI = () => {
    const tipo = form.querySelector("input[name='tipo']:checked")?.value;

    if (tipo === "empresa") {
      cifGroup.style.display = "block";
      cifInput.required = true;
    } else {
      cifGroup.style.display = "none";
      cifInput.required = false;
      cifInput.value = "";
    }
  };

  tipoRadios.forEach(radio => {
    radio.addEventListener("change", updateEmpresaUI);
  });

  updateEmpresaUI();

  /* =========================
     FEEDBACK
  ========================= */
  const showError = (msg) => {
    let box = form.querySelector(".contact-feedback");
    if (!box) {
      box = document.createElement("div");
      box.className = "contact-feedback error";
      form.prepend(box);
    }
    box.textContent = msg;
  };

  const clearError = () => {
    const box = form.querySelector(".contact-feedback");
    if (box) box.remove();
  };

  const showToast = (html) => {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.innerHTML = html;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  };

  /* =========================
     SUBMIT
  ========================= */
  form.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();

    const tipo = form.querySelector("input[name='tipo']:checked")?.value || "particular";

    const cifRaw = form.cif?.value.trim().toUpperCase() || "";
    const cif = cifRaw ? cifRaw : null;

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone?.value.trim() || null,
      tipo,
      cif, // 🔥 null si vacío
      subject: form.subject.value.trim(),
      message: form.message.value.trim()
    };

    /* =========================
       VALIDACIONES
    ========================= */
    if (!data.name || !data.email || !data.message) {
      showError("❌ Completa los campos obligatorios.");
      return;
    }

    if (tipo === "empresa" && !data.cif) {
      showError("❌ El CIF es obligatorio si eres empresa.");
      return;
    }

    /* =========================
       BLOQUEO BOTÓN (ANTI SPAM)
    ========================= */
    if (submitBtn.disabled) return;

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Enviando…";

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error();

      const { ticketId } = await res.json();

      form.reset();
      updateEmpresaUI();
      closeModal();

      showToast(`
        <b>Solicitud enviada</b><br>
        Ticket: <b>${ticketId}</b><br>
        Revisa tu correo.
      `);

    } catch {
      showError("❌ No se pudo enviar el mensaje.");
    } finally {
      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }, 1200);
    }
  });
});