/* =====================================================
   CONFIGURACIÓN Y AUTH
===================================================== */
const API_BASE = "https://api.onionit.net"; // Ajusta a tu URL real
const token = localStorage.getItem("onion_token");

// Si no hay token, redirigir al login
if (!token) {
    window.location.href = "/es/acceso/";
}

const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
};

/* =====================================================
   SELECTORES
===================================================== */
const form = document.getElementById("createUserForm");
const btnSubmit = form.querySelector('button[type="submit"]');

/* =====================================================
   HELPERS DE UI
===================================================== */
function showToast(message, type = "success") {
    const container = document.querySelector(".toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function setSubmitting(isSubmitting) {
    if (isSubmitting) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Creando...";
    } else {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Crear usuario";
    }
}

/* =====================================================
   LÓGICA DE ENVÍO
===================================================== */
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Recopilar datos básicos
    const userData = {
        name: document.getElementById("name").value.trim(),
        username: document.getElementById("username").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        password: document.getElementById("password").value, // El backend decidirá si lo usa o envía mail
        role: document.getElementById("role").value,
        tipo: document.getElementById("tipo").value,
        nif: document.getElementById("nif").value.trim(),
        
        // 2. Toggles (Booleanos)
        active: document.getElementById("active").checked,
        privacyMode: document.getElementById("privacyMode").checked,
        twofa_enabled: document.getElementById("twofa_enabled").checked,

        // 3. Objeto de Dirección (Estructura que espera tu Backend)
        direccion: {
            calle: document.getElementById("calle").value.trim(),
            cp: document.getElementById("cp").value.trim(),
            ciudad: document.getElementById("ciudad").value.trim(),
            provincia: document.getElementById("provincia").value.trim(),
            pais: document.getElementById("pais").value.trim() || "España"
        }
    };

    // Validación simple antes de enviar
    if (!userData.name || !userData.email) {
        showToast("Nombre y Email son obligatorios", "error");
        return;
    }

    setSubmitting(true);

    try {
        const response = await fetch(`${API_BASE}/api/users/create`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Error al crear el usuario");
        }

        if (data.ok) {
            showToast("Usuario creado correctamente. Se ha enviado email de activación.");
            form.reset();
            // Opcional: Redirigir a la lista de usuarios tras 2 segundos
            setTimeout(() => {
                window.location.href = "/es/acceso/admin/usuarios";
            }, 2000);
        }

    } catch (err) {
        console.error("❌ CREATE USER ERROR:", err);
        showToast(err.message, "error");
    } finally {
        setSubmitting(false);
    }
});