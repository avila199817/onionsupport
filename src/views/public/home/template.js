import { PUBLIC_SITE } from "../../../core/public-site.js";

import {
  PUBLIC_AUTH_LOGO,
  PUBLIC_AUTH_LOGO_WEBP,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const PUBLIC_HOME_TEMPLATE_VERSION = "public.home.template.final.productivo.2026.25-login-anchor-canonical";

const APP_NAME = PUBLIC_SITE.name;

const CRISTIAN_PROFILE_PHOTO = "src/media/img/Cristian_Avila_960.webp";
const CRISTIAN_PROFILE_PHOTO_WEBP_224 = "src/media/img/Cristian_Avila_224.webp";
const CRISTIAN_PROFILE_PHOTO_WEBP_480 = "src/media/img/Cristian_Avila_480.webp";
const CRISTIAN_PROFILE_PHOTO_WEBP_640 = "src/media/img/Cristian_Avila_640.webp";
const CRISTIAN_PROFILE_PHOTO_WEBP_960 = "src/media/img/Cristian_Avila_960.webp";

const BUSINESS = {
  ...PUBLIC_SITE,
  legalServiceName: "Servicio técnico informático",
  copyrightYear: "2026",
  loginPath: "/login",
  profileRole: "Técnico informático",
  profilePhoto: CRISTIAN_PROFILE_PHOTO,
  profileExperienceValue: "+8",
  profileExperienceLabel: "años de experiencia",
  profileClientsValue: "+300",
  profileClientsLabel: "clientes atendidos",
};

const DEFAULT_INCIDENT_MESSAGE =
  "Hola Cristian, vengo desde Onion Support. Quiero solicitar un diagnóstico técnico.";


function text(value = "", fallback = "") {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

  return output || fallback;
}

function phoneDigits(value = "") {
  return text(value, "").replace(/[^\d]/g, "");
}

function whatsappHref(message = DEFAULT_INCIDENT_MESSAGE) {
  const phone = phoneDigits(BUSINESS.phoneInternational);
  const cleanMessage = text(message, DEFAULT_INCIDENT_MESSAGE);

  return `https://wa.me/${phone}?text=${encodeURIComponent(cleanMessage)}`;
}

function mailHref(subject = "Diagnóstico desde Onion Support") {
  return `mailto:${BUSINESS.email}?subject=${encodeURIComponent(text(subject, "Diagnóstico desde Onion Support"))}`;
}


function renderIcon(name = "") {
  const icons = {
    menu: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>`,
    close: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5 17.5 17.5"></path><path d="M17.5 6.5 6.5 17.5"></path></svg>`,
    arrow: `<svg class="public-home-icon public-home-icon--arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13"></path><path d="m13 6 6 6-6 6"></path></svg>`,
    whatsapp: `<svg class="public-home-icon public-home-icon--whatsapp" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.5 32 1.9 131.6 1.9 254c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157ZM223.9 438.7c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1s56.2 81.2 56.1 130.5c0 101.8-84.9 184.6-186.6 184.6Zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6Z"></path></svg>`,
    mail: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.75 6.75h14.5v10.5H4.75V6.75Z"></path><path d="m5.25 7.25 6.75 5.5 6.75-5.5"></path></svg>`,
    shield: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.75 19.25 6v5.5c0 4.42-2.95 7.28-7.25 8.75-4.3-1.47-7.25-4.33-7.25-8.75V6L12 3.75Z"></path><path d="m8.75 12 2.15 2.15 4.35-4.65"></path></svg>`,
    bolt: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.25 2.75 5.75 13h5L10.75 21.25 18.25 10h-5l.25-7.25Z"></path></svg>`,
    invoice: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.25 3.75h9.5v16.5l-2-1.2-2.75 1.2-2.75-1.2-2 1.2V3.75Z"></path><path d="M9.25 8h5.5"></path><path d="M9.25 11.75h5.5"></path><path d="M9.25 15.5h3"></path></svg>`,
    laptop: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.25 5.75h11.5v8.5H6.25v-8.5Z"></path><path d="M4.25 18.25h15.5l-2-4H6.25l-2 4Z"></path></svg>`,
    chip: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 8h8v8H8V8Z"></path><path d="M9.25 2.75v3"></path><path d="M14.75 2.75v3"></path><path d="M9.25 18.25v3"></path><path d="M14.75 18.25v3"></path><path d="M2.75 9.25h3"></path><path d="M2.75 14.75h3"></path><path d="M18.25 9.25h3"></path><path d="M18.25 14.75h3"></path></svg>`,
    system: `<svg class="public-home-icon public-home-icon--system" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.25 4.75h11.5c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5H6.25c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5Z"></path><path d="M12 4.75v11"></path><path d="M4.75 10.25h14.5"></path><path d="M12 15.75v3"></path><path d="M9 19.25h6"></path></svg>`,
    speed: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.75 16.25a8.25 8.25 0 1 1 14.5 0"></path><path d="m12 14 4-4"></path><path d="M12 14.25h.01"></path><path d="M7.25 16.25h9.5"></path></svg>`,
    wifi: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.25 9.25a12 12 0 0 1 15.5 0"></path><path d="M7.25 12.25a7.5 7.5 0 0 1 9.5 0"></path><path d="M10.25 15.25a3 3 0 0 1 3.5 0"></path><path d="M12 18.25h.01"></path></svg>`,
    printer: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.25 8.25v-4.5h9.5v4.5"></path><path d="M7.25 16.25H5.5a1.75 1.75 0 0 1-1.75-1.75v-4.25A2.25 2.25 0 0 1 6 8h12a2.25 2.25 0 0 1 2.25 2.25v4.25a1.75 1.75 0 0 1-1.75 1.75h-1.75"></path><path d="M7.25 13.25h9.5v7h-9.5v-7Z"></path><path d="M16.75 11.25h.01"></path></svg>`,
    lock: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.25 10.75h9.5v8.5h-9.5v-8.5Z"></path><path d="M9 10.75V8a3 3 0 0 1 6 0v2.75"></path></svg>`,
    portfolio: `<svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.25 6.25h9.5a2 2 0 0 1 2 2v10H5.25v-10a2 2 0 0 1 2-2Z"></path><path d="M9.25 6.25V4.75h5.5v1.5"></path><path d="M4 18.25h16"></path></svg>`,
    check: `<svg class="public-home-icon public-home-icon--check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5.25 12.5 4.25 4.25 9.25-10"></path></svg>`,
  };

  return icons[name] || "";
}

const NAV_ITEMS = [
  { label: "Inicio", href: "#inicio" },
  { label: "Servicios", href: "#servicios" },
  { label: "Método", href: "#metodo" },
  { label: "Precios", href: "#precios" },
  { label: "Contacto", href: "#contacto" },
  { label: "FAQ", href: "#faq" },
];

const TRUST_ITEMS = [
  { icon: "bolt", label: "Respuesta ágil" },
  { icon: "shield", label: "Profesional" },
  { icon: "invoice", label: "Factura disponible" },
];

const SERVICES = [
  {
    icon: "laptop",
    title: "Ordenadores y portátiles",
    href: "/reparacion-ordenadores",
    text: "Arranque, lentitud, pantallazos, temperatura, batería, disco, periféricos y fallos de uso diario.",
  },
  {
    icon: "chip",
    title: "SSD, RAM y componentes",
    href: "/reparacion-ordenadores",
    text: "Mejoras con sentido para ganar velocidad, estabilidad y vida útil sin cambiar de equipo.",
  },
  {
    icon: "system",
    title: "Sistema operativo",
    href: "/soporte-informatico",
    text: "Instalación limpia, drivers, actualizaciones, configuración base y equipo listo para trabajar.",
  },
  {
    icon: "speed",
    title: "Optimización real",
    href: "/soporte-informatico",
    text: "Inicio, almacenamiento, programas pesados y ajustes para recuperar fluidez sin humo.",
  },
  {
    icon: "wifi",
    title: "WiFi y redes",
    href: "/redes-wifi",
    text: "Red doméstica, repetidores, conexión estable, configuración de dispositivos y pequeños entornos.",
  },
  {
    icon: "printer",
    title: "Impresoras y periféricos",
    href: "/impresoras",
    text: "Instalación, conexión, drivers, escáner, impresoras compartidas y periféricos de trabajo.",
  },
  {
    icon: "shield",
    title: "Diagnóstico técnico",
    href: "/soporte-informatico",
    text: "Primero claridad: qué falla, qué merece la pena reparar y qué no conviene tocar.",
  },
  {
    icon: "lock",
    title: "Seguridad y limpieza",
    href: "/soporte-informatico",
    text: "Revisión básica, limpieza de software, permisos, navegador, programas no deseados y estabilidad.",
  },
  {
    icon: "portfolio",
    title: "Portfolio técnico",
    href: "/soporte-empresas",
    text: "Soluciones reales para particulares, autónomos, comercios y equipos que tienen que funcionar.",
  },
];

const METHOD_STEPS = [
  {
    icon: "shield",
    title: "Diagnóstico primero",
    text: "Reviso síntomas, urgencia y contexto antes de tocar nada. Claridad antes que prisas.",
  },
  {
    icon: "portfolio",
    title: "Solución con criterio",
    text: "Te explico qué merece la pena reparar, qué conviene mejorar y qué no compensa.",
  },
  {
    icon: "invoice",
    title: "Presupuesto y factura",
    text: "Intervención formal, presupuesto previo y factura disponible para particulares y negocios.",
  },
];

const PRICE_CARDS = [
  {
    eyebrow: "Incidencia",
    title: "Diagnóstico inicial",
    text: "Abrimos el caso, revisamos síntomas y definimos el siguiente paso antes de intervenir.",
    points: ["Consulta directa", "Criterio técnico", "Sin compromiso"],
  },
  {
    eyebrow: "Mejora",
    title: "SSD, RAM y rendimiento",
    text: "La opción fuerte para equipos lentos que todavía pueden trabajar muy bien.",
    points: ["Componentes adecuados", "Instalación limpia", "Prueba final"],
    featured: true,
  },
  {
    eyebrow: "Sistema",
    title: "Puesta a punto completa",
    text: "Sistema limpio, drivers, configuración base y equipo preparado para volver al ritmo.",
    points: ["Sistema operativo", "Drivers y apps", "Equipo listo"],
  },
];

const FAQS = [
  {
    question: "¿Cómo solicito un diagnóstico?",
    answer: "Pulsa en Solicitar diagnóstico y se abrirá WhatsApp con un mensaje preparado para explicar el problema.",
  },
  {
    question: "¿Hay presupuesto antes de reparar?",
    answer: "Sí. Primero se revisa el caso y se propone la solución antes de avanzar.",
  },
  {
    question: "¿Emites factura?",
    answer: "Sí. El servicio está preparado para particulares, autónomos y negocios.",
  },
  {
    question: "¿Qué datos conviene enviar?",
    answer: "Modelo del equipo, qué ocurre, desde cuándo pasa, mensajes de error y nivel de urgencia.",
  },
];

function renderLogo({ compact = false } = {}) {
  const logoFallback = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);
  const logoWebp = safeAssetSrc(PUBLIC_AUTH_LOGO_WEBP, PUBLIC_AUTH_LOGO_WEBP);

  return `
    <span class="public-home-brand-mark" aria-hidden="true">
      <picture>
        <source type="image/webp" srcset="${escapeAttr(logoWebp)}">
        <img class="public-home-brand-logo" src="${escapeAttr(logoFallback)}" alt="" width="44" height="44" loading="eager" decoding="async" draggable="false">
      </picture>
    </span>
    <span class="public-home-brand-copy">
      <span class="public-home-brand-name"><span>ONION</span><strong>SUPPORT</strong></span>
      ${compact ? "": `<span class="public-home-brand-subtitle">${escapeHtml(BUSINESS.legalServiceName)}</span>`}
    </span>
  `;
}

function renderNavLinks() {
  return NAV_ITEMS.map((item) => `
    <a class="public-home-nav-link" href="${escapeAttr(item.href)}" data-public-home-nav-link="true" data-public-home-scroll-link="true">
      ${escapeHtml(item.label)}
    </a>
  `).join("");
}

function renderTrustItems() {
  return TRUST_ITEMS.map((item, index) => `
    <li class="public-home-trust-item${item.blue ? " public-home-trust-item--blue": ""}" data-public-home-reveal="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-trust-icon" aria-hidden="true">${renderIcon(item.icon)}</span>
      <span>${escapeHtml(item.label)}</span>
    </li>
  `).join("");
}

function renderServices() {
  return SERVICES.map((service, index) => `
    <a class="public-home-service-card" href="${escapeAttr(service.href)}" aria-label="${escapeAttr(`${service.title} · Ver servicio`)}" data-public-home-service-link="true" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-service-icon" aria-hidden="true">${renderIcon(service.icon)}</span>
      <h3>${escapeHtml(service.title)}</h3>
      <p>${escapeHtml(service.text)}</p>
    </a>
  `).join("");
}

function renderPriceCards() {
  return PRICE_CARDS.map((card, index) => {
    const featured = Boolean(card.featured);
    const message = `Hola Cristian, quiero solicitar un diagnóstico sobre: ${card.title}.`;

    return `
      <article class="public-home-price-card ${featured ? "public-home-price-card--featured": ""}" data-featured="${featured ? "true": "false"}" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
        ${featured ? `<span class="public-home-price-badge">Recomendado</span>`: ""}
        <p class="public-home-price-eyebrow">${escapeHtml(card.eyebrow)}</p>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
        <ul class="public-home-price-points">
          ${(card.points || []).map((point) => `<li><span aria-hidden="true">${renderIcon("check")}</span><span>${escapeHtml(point)}</span></li>`).join("")}
        </ul>
        <a class="public-home-price-link" href="${escapeAttr(whatsappHref(message))}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
          Solicitar diagnóstico ${renderIcon("arrow")}
        </a>
      </article>
    `;
  }).join("");
}

function renderFaqs() {
  return FAQS.map((faq, index) => `
    <details class="public-home-faq-item" data-public-home-reveal="true">
      <summary>${escapeHtml(faq.question)}</summary>
      <p>${escapeHtml(faq.answer)}</p>
    </details>
  `).join("");
}

function renderHeader() {
  const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");

  return `
    <header class="public-home-nav" data-public-home-nav="true">
      <div class="public-home-nav-inner">
        <a class="public-home-brand" href="#inicio" aria-label="${escapeAttr(BUSINESS.name)}" data-public-home-scroll-link="true">
          ${renderLogo()}
        </a>
        <nav class="public-home-nav-panel" id="public-home-nav-panel" aria-label="Navegación principal" data-public-home-nav-panel="true">
          <div class="public-home-nav-menu" data-public-home-menu="true">${renderNavLinks()}</div>
          <div class="public-home-nav-actions">
            <a class="public-home-login-link" href="${escapeAttr(loginHref)}" data-spa="true" data-router-link="true" data-route="${escapeAttr(loginHref)}" data-href="${escapeAttr(loginHref)}" data-public-home-login="true">Iniciar sesión</a>
            <a class="public-home-nav-cta" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
              ${renderIcon("whatsapp")}<span>Solicitar diagnóstico</span>
            </a>
          </div>
        </nav>
        <div class="public-home-nav-tools" data-public-home-nav-tools="true">
          <div class="public-home-nav-account-slot" data-public-home-account-slot="true" hidden aria-hidden="true"></div>
          <button class="public-home-nav-toggle" type="button" aria-label="Abrir menú" aria-controls="public-home-nav-panel" aria-expanded="false" data-public-home-nav-toggle="true">
            <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--open" aria-hidden="true">${renderIcon("menu")}</span>
            <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--close" aria-hidden="true">${renderIcon("close")}</span>
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderHeroVisual() {
  const profilePhoto = safeAssetSrc(BUSINESS.profilePhoto, BUSINESS.profilePhoto);
  const profilePhotoWebp224 = safeAssetSrc(
    CRISTIAN_PROFILE_PHOTO_WEBP_224,
    CRISTIAN_PROFILE_PHOTO_WEBP_224
  );
  const profilePhotoWebp480 = safeAssetSrc(
    CRISTIAN_PROFILE_PHOTO_WEBP_480,
    CRISTIAN_PROFILE_PHOTO_WEBP_480
  );
  const profilePhotoWebp640 = safeAssetSrc(
    CRISTIAN_PROFILE_PHOTO_WEBP_640,
    CRISTIAN_PROFILE_PHOTO_WEBP_640
  );
  const profilePhotoWebp960 = safeAssetSrc(
    CRISTIAN_PROFILE_PHOTO_WEBP_960,
    CRISTIAN_PROFILE_PHOTO_WEBP_960
  );
  const profilePhotoWebpSrcset = `${profilePhotoWebp224} 224w, ${profilePhotoWebp480} 480w, ${profilePhotoWebp640} 640w, ${profilePhotoWebp960} 960w`;
  const profilePhotoSizes = "(max-width: 720px) calc(100vw - 90px), (max-width: 1040px) 206px, (max-width: 1240px) 176px, 196px";

  return `
    <article class="public-home-profile-card public-home-profile-card--command" aria-label="Perfil profesional de ${escapeAttr(BUSINESS.ownerName)}" data-public-home-card="true" data-public-home-magnetic="true">
      <div class="public-home-profile-top" aria-hidden="true">
        <span></span><span></span><span></span>
        <strong>ONION SUPPORT</strong>
      </div>

      <div class="public-home-profile-command">
        <section class="public-home-command-hero" aria-label="Resumen profesional">
          <div class="public-home-command-portrait">
            <picture class="public-home-command-picture">
              <source type="image/webp" srcset="${escapeAttr(profilePhotoWebpSrcset)}" sizes="${escapeAttr(profilePhotoSizes)}">
              <img class="public-home-command-photo" src="${escapeAttr(profilePhoto)}" alt="${escapeAttr(BUSINESS.ownerName)} - ${escapeAttr(BUSINESS.name)}" width="480" height="600" loading="eager" decoding="async" fetchpriority="high" draggable="false">
            </picture>
          </div>

          <div class="public-home-command-copy">
            <p class="public-home-profile-eyebrow">Servicio técnico informático</p>
            <h2><span>Cristian</span><span>Ávila</span></h2>
            <p>Diagnóstico claro, trato directo y reparación con criterio antes de tocar nada.</p>
            <div class="public-home-command-tags" aria-label="Especialidades principales">
              <span>${renderIcon("shield")} Diagnóstico</span>
              <span>${renderIcon("chip")} Hardware</span>
              <span>${renderIcon("wifi")} Redes</span>
            </div>
          </div>
        </section>

        <section class="public-home-command-stats" aria-label="Datos de confianza">
          <div class="public-home-command-stat">
            <span>Experiencia</span>
            <strong>${escapeHtml(BUSINESS.profileExperienceValue)}</strong>
            <small>${escapeHtml(BUSINESS.profileExperienceLabel)}</small>
          </div>
          <div class="public-home-command-stat">
            <span>Clientes</span>
            <strong>${escapeHtml(BUSINESS.profileClientsValue)}</strong>
            <small>${escapeHtml(BUSINESS.profileClientsLabel)}</small>
          </div>
        </section>

        <ul class="public-home-command-checklist">
          <li><span aria-hidden="true">${renderIcon("check")}</span><span>Presupuesto antes de reparar</span></li>
          <li><span aria-hidden="true">${renderIcon("check")}</span><span>Particulares, autónomos y negocios</span></li>
          <li><span aria-hidden="true">${renderIcon("check")}</span><span>SSD · RAM · WiFi · Sistema · Impresoras</span></li>
        </ul>
      </div>

      <div class="public-home-profile-bottom">
        <span>${renderIcon("shield")} Diagnóstico claro</span>
        <span>${renderIcon("whatsapp")} ${escapeHtml(BUSINESS.phoneDisplay)}</span>
      </div>
    </article>
  `;
}

function renderHero() {
  return `
    <section class="public-home-section public-home-hero" id="inicio" data-public-home-section="inicio" aria-labelledby="public-home-title">
      <div class="public-home-hero-bg" aria-hidden="true"></div>
      <div class="public-home-hero-grid">
        <div class="public-home-hero-copy">
          <h1 class="public-home-title" id="public-home-title" data-public-home-reveal="true">
            Servicio técnico <span>informático</span>
          </h1>
          <p class="public-home-hero-text" data-public-home-reveal="true">
            ${escapeHtml(PUBLIC_SITE.description)}
          </p>
          <div class="public-home-hero-actions" data-public-home-reveal="true">
            <a class="public-home-button public-home-button--primary" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
              <span>Pedir diagnóstico</span>${renderIcon("whatsapp")}
            </a>
            <a class="public-home-button public-home-button--secondary" href="#servicios" data-public-home-scroll-link="true">
              <span>Ver servicios</span>${renderIcon("arrow")}
            </a>
          </div>
          <ul class="public-home-trust-list" aria-label="Ventajas principales">${renderTrustItems()}</ul>
        </div>
        <div class="public-home-hero-visual public-home-hero-visual--profile" data-public-home-reveal="true">${renderHeroVisual()}</div>
      </div>
    </section>
  `;
}

function renderMethodSteps() {
  return METHOD_STEPS.map((step, index) => `
    <article class="public-home-method-card" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-method-number">0${escapeHtml(index + 1)}</span>
      <span class="public-home-method-icon" aria-hidden="true">${renderIcon(step.icon)}</span>
      <h3>${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.text)}</p>
    </article>
  `).join("");
}

function renderMethodSection() {
  return `
    <section class="public-home-section public-home-method" id="metodo" data-public-home-section="metodo" aria-labelledby="public-home-method-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <p class="public-home-price-eyebrow">Método Onion Support</p>
        <h2 id="public-home-method-title">Antes de reparar, claridad.</h2>
        <p>Un proceso directo para que sepas qué pasa, qué opciones tienes y cuánto compensa invertir.</p>
      </div>
      <div class="public-home-method-grid">${renderMethodSteps()}</div>
    </section>
  `;
}

function renderServiceSection() {
  return `
    <section class="public-home-section public-home-services" id="servicios" data-public-home-section="servicios" aria-labelledby="public-home-services-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <h2 id="public-home-services-title">Todo lo que tu equipo necesita.</h2>
        <p>Soluciones IT pensadas para recuperar rendimiento, estabilidad y confianza desde el primer diagnóstico.</p>
      </div>
      <div class="public-home-service-grid">${renderServices()}</div>
    </section>
  `;
}

function renderPricesSection() {
  return `
    <section class="public-home-section public-home-prices" id="precios" data-public-home-section="precios" aria-labelledby="public-home-prices-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <h2 id="public-home-prices-title">Primero claridad. Después reparación.</h2>
        <p>Antes de tocar nada: diagnóstico, opciones claras y presupuesto previo.</p>
      </div>
      <div class="public-home-price-grid">${renderPriceCards()}</div>
    </section>
  `;
}

function renderContactSection() {
  return `
    <section class="public-home-section public-home-contact" id="contacto" data-public-home-section="contacto" aria-labelledby="public-home-contact-title">
      <div class="public-home-contact-panel" data-public-home-reveal="true" data-public-home-magnetic="true">
        <div>
          <p class="public-home-price-eyebrow">Contacto</p>
          <h2 id="public-home-contact-title">Cuéntame qué le pasa al equipo.</h2>
          <p>Envíame modelo, síntomas, urgencia y cualquier mensaje de error. Te respondo con el siguiente paso claro.</p>
        </div>
        <div class="public-home-contact-actions">
          <a class="public-home-button public-home-button--primary" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
            ${renderIcon("whatsapp")}<span>Solicitar diagnóstico</span>
          </a>
          <a class="public-home-button public-home-button--secondary" href="${escapeAttr(mailHref())}" data-public-home-cta="true">
            ${renderIcon("mail")}<span>Enviar email</span>
          </a>
        </div>
      </div>
    </section>
  `;
}

function renderFaqSection() {
  return `
    <section class="public-home-section public-home-faq" id="faq" data-public-home-section="faq" aria-labelledby="public-home-faq-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <h2 id="public-home-faq-title">Dudas rápidas antes de solicitar diagnóstico.</h2>
      </div>
      <div class="public-home-faq-list">${renderFaqs()}</div>
    </section>
  `;
}

function renderFooter() {
  const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");

  return `
    <footer class="public-home-footer">
      <div class="public-home-footer-inner">
        <div class="public-home-footer-brand">${renderLogo()}</div>
        <div class="public-home-footer-links">
          <a href="#inicio" data-public-home-scroll-link="true">Inicio</a>
          <a href="#servicios" data-public-home-scroll-link="true">Servicios</a>
          <a href="#metodo" data-public-home-scroll-link="true">Método</a>
          <a href="#precios" data-public-home-scroll-link="true">Precios</a>
          <a href="#contacto" data-public-home-scroll-link="true">Contacto</a>
          <a href="#faq" data-public-home-scroll-link="true">FAQ</a>
          <a href="${escapeAttr(loginHref)}" data-spa="true" data-router-link="true" data-route="${escapeAttr(loginHref)}" data-public-home-login="true">Iniciar sesión</a>
        </div>
        <div class="public-home-footer-contact">
          <a href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">${renderIcon("whatsapp")}<span>Solicitar diagnóstico</span></a>
          <a href="${escapeAttr(mailHref())}" data-public-home-cta="true">${renderIcon("mail")}<span>${escapeHtml(BUSINESS.email)}</span></a>
        </div>
      </div>
      <div class="public-home-footer-bottom">
        <p>© ${escapeHtml(BUSINESS.copyrightYear)} ${escapeHtml(BUSINESS.name)}. Servicio técnico informático profesional.</p>
        <p>${escapeHtml(BUSINESS.domain)}</p>
      </div>
    </footer>
  `;
}

function renderFloatingWhatsApp() {
  return `
    <a class="public-home-floating-whatsapp" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" aria-label="Solicitar diagnóstico por WhatsApp" data-public-home-cta="true">
      ${renderIcon("whatsapp")}
    </a>
  `;
}

export function createPublicHomeTemplate() {
  return renderPublicShell({
    view: "home",
    appName: APP_NAME,
    header: false,
    ariaLabelledBy: "public-home-title",
    body: `
      <div
        class="public-home"
        data-public-home="true"
        data-public-home-template-version="${escapeAttr(PUBLIC_HOME_TEMPLATE_VERSION)}"
        data-business-phone="${escapeAttr(BUSINESS.phoneDisplay)}"
        data-business-whatsapp="${escapeAttr(BUSINESS.phoneInternational)}"
        data-business-email="${escapeAttr(BUSINESS.email)}"
      >
        <div class="public-home-background" aria-hidden="true">
          <span class="public-home-bg-orb public-home-bg-orb--one"></span>
          <span class="public-home-bg-orb public-home-bg-orb--two"></span>
          <span class="public-home-bg-orb public-home-bg-orb--three"></span>
          <span class="public-home-bg-grid"></span>
          <span class="public-home-bg-noise"></span>
        </div>
        <div class="public-home-scrollbar" data-public-home-scrollbar="true" aria-hidden="true"><span class="public-home-scrollbar-thumb" data-public-home-scrollbar-thumb="true"></span></div>
        ${renderHeader()}
        <div class="public-home-content" data-public-home-main="true">
          ${renderHero()}
          ${renderServiceSection()}
          ${renderMethodSection()}
          ${renderPricesSection()}
          ${renderContactSection()}
          ${renderFaqSection()}
        </div>
        ${renderFooter()}
        ${renderFloatingWhatsApp()}
      </div>
    `,
  });
}

export function getPublicHomeTemplate() {
  return createPublicHomeTemplate();
}

export const getTemplate = createPublicHomeTemplate;

export default createPublicHomeTemplate;
