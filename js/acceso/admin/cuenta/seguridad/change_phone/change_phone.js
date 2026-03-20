document.addEventListener("DOMContentLoaded", () => {

  const requestForm = document.getElementById("requestPhoneForm");
  const verifyForm  = document.getElementById("verifyPhoneForm");

  if (!requestForm || !verifyForm) return;

  const phoneInput = document.getElementById("newPhone");
  const otpInput   = document.getElementById("otpCode");
  const stepText   = document.getElementById("phoneStepText");

  const requestBtn = requestForm.querySelector("button[type='submit']");
  const verifyBtn  = verifyForm.querySelector("button[type='submit']");

  const errorBox = document.querySelector(".login-error");

  const token = localStorage.getItem("onion_token");

  if (!token) {
    window.location.href = "/es/acceso/";
    return;
  }

  let currentPhoneE164 = null;

  /* =========================
     ERROR UI
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
     LOADING BUTTON
  ========================= */
  const setLoading = (button, isLoading, text = "Procesando…") => {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  };

  /* =========================
     LIMPIAR FORMATO
  ========================= */
  function cleanPhone(value) {
    return value.replace(/\D/g, "").substring(0, 9);
  }

  /* =========================
     VALIDACIÓN ESPAÑA
  ========================= */
  function isValidPhone(phoneDigits) {
    return /^[679]\d{8}$/.test(phoneDigits);
  }

  /* =========================
     ENMASCARAR TELÉFONO
     +34 612 *** 678
  ========================= */
  function maskPhone(e164) {
    const digits = e164.replace("+34", "");
    return `+34 ${digits.substring(0,3)} *** ${digits.substring(6)}`;
  }

  /* =========================
     STEP 1 → ENVIAR OTP
  ========================= */
  requestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const rawValue = phoneInput.value;
    const digits = cleanPhone(rawValue);

    if (!isValidPhone(digits)) {
      showError("Teléfono inválido");
      return;
    }

    const phoneE164 = `+34${digits}`;

    setLoading(requestBtn, true, "Enviando código…");

    try {

      const res = await fetch(
        "https://api.onionit.net/api/users/phone/request-phone-change",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ phone: phoneE164 })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error("REQUEST_FAIL");
      }

      currentPhoneE164 = phoneE164;

      /* 🔄 CAMBIO DE STEP */
      requestForm.style.display = "none";
      verifyForm.style.display = "block";

      /* 🔥 CAMBIO TEXTO DINÁMICO */
      if (stepText) {
        stepText.textContent =
          `Hemos enviado un código a ${maskPhone(phoneE164)}`;
      }

      if (otpInput) otpInput.focus();

    } catch (err) {
      console.error("PHONE REQUEST ERROR:", err);
      showError("No se pudo enviar el código");
    } finally {
      setLoading(requestBtn, false);
    }
  });

  /* =========================
     STEP 2 → VERIFICAR OTP
  ========================= */
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const code = otpInput ? otpInput.value.trim() : "";

    if (!/^\d{6}$/.test(code)) {
      showError("Código inválido");
      return;
    }

    setLoading(verifyBtn, true, "Verificando…");

    try {

      const res = await fetch(
        "https://api.onionit.net/api/users/phone/verify-phone-change",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            phone: currentPhoneE164,
            code
          })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error("VERIFY_FAIL");
      }

      /* 🔐 LIMPIAR 2FA CONFIRM */
      localStorage.removeItem("onion_2fa_confirmed");

      /* 🔄 ACTUALIZAR CACHE LOCAL */
      localStorage.setItem("onion_user_phone", currentPhoneE164);

      /* 🔁 REDIRECT PANEL */
      window.location.href =
        "/es/acceso/admin/cuenta/seguridad/?phone=updated";

    } catch (err) {
      console.error("PHONE VERIFY ERROR:", err);
      showError("Código incorrecto o expirado");
    } finally {
      setLoading(verifyBtn, false);
    }
  });

});