document.addEventListener("DOMContentLoaded", () => {

  const toggles = document.querySelectorAll(".modal-toggle");

  const modal = document.getElementById("settingsModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalText = document.getElementById("modalText");
  const modalConfirm = document.getElementById("modalConfirm");
  const modalCancel = document.getElementById("modalCancel");

  let currentToggle = null;
  let previousState = null;

  /* =========================
     CONFIG TEXTOS POR SETTING
  ========================= */

  const settingsConfig = {
    email: {
      title: "Notificaciones por correo",
      textOn: "Activar avisos importantes en tu email.",
      textOff: "Desactivar avisos importantes en tu email."
    },
    security: {
      title: "Alertas de seguridad",
      textOn: "Recibir alertas de seguridad críticas.",
      textOff: "Dejar de recibir alertas de seguridad."
    },
    sessions: {
      title: "Alertas de nuevas sesiones",
      textOn: "Avisar cuando inicies sesión en un dispositivo nuevo.",
      textOff: "No avisar sobre nuevas sesiones."
    },
    marketing: {
      title: "Comunicaciones",
      textOn: "Recibir novedades y actualizaciones del producto.",
      textOff: "No recibir comunicaciones promocionales."
    }
  };

  /* =========================
     ABRIR MODAL
  ========================= */

  toggles.forEach(toggle => {

    toggle.addEventListener("change", (e) => {

      currentToggle = toggle;
      previousState = !toggle.checked;

      const settingKey = toggle.dataset.setting;
      const config = settingsConfig[settingKey];

      if (!config) return;

      modalTitle.textContent = config.title;

      modalText.textContent = toggle.checked
        ? config.textOn
        : config.textOff;

      modal.classList.add("active");
    });

  });

  /* =========================
     CANCELAR
  ========================= */

  modalCancel.addEventListener("click", () => {

    if (currentToggle !== null) {
      currentToggle.checked = previousState;
    }

    closeModal();
  });

  /* =========================
     CONFIRMAR
  ========================= */

  modalConfirm.addEventListener("click", () => {

    // Aquí luego meteremos fetch backend
    // Por ahora solo visual

    closeModal();
  });

  /* =========================
     CERRAR MODAL
  ========================= */

  function closeModal() {
    modal.classList.remove("active");
    currentToggle = null;
    previousState = null;
  }

  /* =========================
     CERRAR AL HACER CLICK FUERA
  ========================= */

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      if (currentToggle !== null) {
        currentToggle.checked = previousState;
      }
      closeModal();
    }
  });

});