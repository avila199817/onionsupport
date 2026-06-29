import {
  PUBLIC_AUTH_LOGO,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const PUBLIC_HOME_TEMPLATE_VERSION = "public.home.template.productive.2026.1";

const APP_NAME = "Onion Support";

const BUSINESS = {
  name: "Onion Support",
  legalServiceName: "Servicio técnico informático",
  domain: "onionsupport.com",
  email: "cristian@onionsupport.com",
  phoneDisplay: "629 946 615",
  phoneInternational: "34629946615",
  phoneTel: "+34629946615",
  locationShort: "Sant Vicenç de Castellet",
  locationFull: "Sant Vicenç de Castellet (Barcelona)",
  postalCode: "08295",
  region: "Cataluña",
  country: "España",
  addressFull: "Sant Vicenç de Castellet (Barcelona), 08295, Cataluña, España",
  serviceArea: "Sant Vicenç de Castellet y alrededores",
  invoiceText: "Se emiten facturas",
  copyrightYear: "2026",
  loginPath: "/login",
};

const DEFAULT_WHATSAPP_MESSAGE =
  "Hola Cristian, vengo desde Onion Support. Quiero solicitar un diagnóstico/presupuesto.";

const LOCAL_BUSINESS_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: BUSINESS.name,
  url: `https://${BUSINESS.domain}/`,
  email: BUSINESS.email,
  telephone: BUSINESS.phoneTel,
  areaServed: BUSINESS.serviceArea,
  address: {
    "@type": "PostalAddress",
    addressLocality: BUSINESS.locationShort,
    postalCode: BUSINESS.postalCode,
    addressRegion: BUSINESS.region,
    addressCountry: "ES",
  },
};

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function phoneDigits(value = "") {
  return text(value, "").replace(/[^\d]/g, "");
}

function whatsappHref(message = DEFAULT_WHATSAPP_MESSAGE) {
  const phone = phoneDigits(BUSINESS.phoneInternational);
  const cleanMessage = text(message, DEFAULT_WHATSAPP_MESSAGE);

  return `https://wa.me/${phone}?text=${encodeURIComponent(cleanMessage)}`;
}

function telHref() {
  return `tel:${BUSINESS.phoneTel}`;
}

function mailHref(subject = "Consulta desde Onion Support") {
  return `mailto:${BUSINESS.email}?subject=${encodeURIComponent(text(subject, "Consulta desde Onion Support"))}`;
}

function renderJsonLd() {
  const json = JSON.stringify(LOCAL_BUSINESS_SCHEMA).replace(/</g, "\\u003c");

  return `<script type="application/ld+json" data-public-home-schema="local-business">${json}</script>`;
}

function renderIcon(name = "") {
  const icons = {
    menu: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>
      </svg>
    `,
    close: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 6.5 17.5 17.5"></path><path d="M17.5 6.5 6.5 17.5"></path>
      </svg>
    `,
    arrow: `
      <svg class="public-home-icon public-home-icon--arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12h13"></path><path d="m13 6 6 6-6 6"></path>
      </svg>
    `,
    whatsapp: `
      <svg class="public-home-icon public-home-icon--whatsapp" viewBox="0 0 448 512" aria-hidden="true" focusable="false">
        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.5 32 1.9 131.6 1.9 254c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157ZM223.9 438.7c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1s56.2 81.2 56.1 130.5c0 101.8-84.9 184.6-186.6 184.6Zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6Z"></path>
      </svg>
    `,
    phone: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.1 4.75h2.2c.55 0 1.02.37 1.16.9l.65 2.55a1.2 1.2 0 0 1-.32 1.13L9.7 10.42a10.85 10.85 0 0 0 3.88 3.88l1.09-1.09a1.2 1.2 0 0 1 1.13-.32l2.55.65c.53.14.9.61.9 1.16v2.2a1.6 1.6 0 0 1-1.75 1.6C10.95 17.91 6.09 13.05 5.5 6.5a1.6 1.6 0 0 1 1.6-1.75Z"></path>
      </svg>
    `,
    mail: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 6.75h14.5v10.5H4.75V6.75Z"></path><path d="m5.25 7.25 6.75 5.5 6.75-5.5"></path>
      </svg>
    `,
    location: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19.25 10.5c0 5.25-7.25 9.75-7.25 9.75s-7.25-4.5-7.25-9.75a7.25 7.25 0 1 1 14.5 0Z"></path><path d="M12 13.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z"></path>
      </svg>
    `,
    shield: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 19.25 6v5.5c0 4.42-2.95 7.28-7.25 8.75-4.3-1.47-7.25-4.33-7.25-8.75V6L12 3.75Z"></path><path d="m8.75 12 2.15 2.15 4.35-4.65"></path>
      </svg>
    `,
    bolt: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M13.25 2.75 5.75 13h5L10.75 21.25 18.25 10h-5l.25-7.25Z"></path>
      </svg>
    `,
    home: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m3.75 11.25 8.25-7 8.25 7"></path><path d="M6.25 10.25v9h11.5v-9"></path><path d="M10 19.25v-5.5h4v5.5"></path>
      </svg>
    `,
    invoice: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 3.75h9.5v16.5l-2-1.2-2.75 1.2-2.75-1.2-2 1.2V3.75Z"></path><path d="M9.25 8h5.5"></path><path d="M9.25 11.75h5.5"></path><path d="M9.25 15.5h3"></path>
      </svg>
    `,
    laptop: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.25 5.75h11.5v8.5H6.25v-8.5Z"></path><path d="M4.25 18.25h15.5l-2-4H6.25l-2 4Z"></path>
      </svg>
    `,
    chip: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 8h8v8H8V8Z"></path><path d="M9.25 2.75v3"></path><path d="M14.75 2.75v3"></path><path d="M9.25 18.25v3"></path><path d="M14.75 18.25v3"></path><path d="M2.75 9.25h3"></path><path d="M2.75 14.75h3"></path><path d="M18.25 9.25h3"></path><path d="M18.25 14.75h3"></path>
      </svg>
    `,
    refresh: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19.25 8.75V4.75h-4"></path><path d="M18.58 5.42A8.25 8.25 0 1 0 20 12"></path><path d="M4.75 15.25v4h4"></path>
      </svg>
    `,
    speed: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 16.25a8.25 8.25 0 1 1 14.5 0"></path><path d="m12 14 4-4"></path><path d="M12 14.25h.01"></path><path d="M7.25 16.25h9.5"></path>
      </svg>
    `,
    wifi: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.25 9.25a12 12 0 0 1 15.5 0"></path><path d="M7.25 12.25a7.5 7.5 0 0 1 9.5 0"></path><path d="M10.25 15.25a3 3 0 0 1 3.5 0"></path><path d="M12 18.25h.01"></path>
      </svg>
    `,
    diagnostic: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 4.75v6a4.75 4.75 0 0 0 9.5 0v-6"></path><path d="M7.25 4.75h-1.5"></path><path d="M16.75 4.75h1.5"></path><path d="M12 15.5v1.75a3 3 0 0 0 3 3h.75"></path><path d="M17.25 20.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path>
      </svg>
    `,
    chat: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 5.75h14.5v9.5H9.5l-4.75 4v-13.5Z"></path>
      </svg>
    `,
    clipboard: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.75 5.75h6.5"></path><path d="M9 3.75h6a1 1 0 0 1 1 1v1.5H8V4.75a1 1 0 0 1 1-1Z"></path><path d="M6.25 5.75h11.5v14.5H6.25V5.75Z"></path><path d="M9.25 11h5.5"></path><path d="M9.25 15h4"></path>
      </svg>
    `,
    wrench: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14.25 6.25a5 5 0 0 0 6.25 6.25l-7.75 7.75a2.5 2.5 0 0 1-3.5 0l-5.5-5.5a2.5 2.5 0 0 1 0-3.5l7.75-7.75a5 5 0 0 0 2.75 2.75Z"></path><path d="M7.25 14.25 9.75 16.75"></path>
      </svg>
    `,
    check: `
      <svg class="public-home-icon public-home-icon--check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5.25 12.5 4.25 4.25 9.25-10"></path>
      </svg>
    `,
    lock: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 10.75h9.5v8.5h-9.5v-8.5Z"></path><path d="M9 10.75V8a3 3 0 0 1 6 0v2.75"></path>
      </svg>
    `,
  };

  return icons[name] || "";
}

const NAV_ITEMS = [
  { label: "Inicio", href: "#inicio" },
  { label: "Servicios", href: "#servicios" },
  { label: "Método", href: "#como-trabajo" },
  { label: "Precios", href: "#precios" },
  { label: "Contacto", href: "#contacto" },
  { label: "FAQ", href: "#faq" },
];

const TRUST_ITEMS = [
  { icon: "bolt", label: "Respuesta ágil" },
  { icon: "home", label: "A domicilio" },
  { icon: "invoice", label: "Factura disponible" },
];

const HERO_METRICS = [
  { label: "Atención local", value: "100", suffix: "%" },
  { label: "Canal directo", value: "1", suffix: ":1" },
  { label: "Servicio activo", value: "2026", suffix: "" },
];

const SERVICES = [
  {
    icon: "laptop",
    title: "Ordenadores y portátiles",
    text: "Diagnóstico de arranque, lentitud, pantallazos, temperatura, discos, batería, periféricos y fallos de uso diario.",
  },
  {
    icon: "chip",
    title: "SSD, RAM y componentes",
    text: "Mejoras con sentido: más velocidad, estabilidad y vida útil sin vender piezas innecesarias.",
  },
  {
    icon: "refresh",
    title: "Sistema limpio",
    text: "Reinstalación, drivers, actualizaciones, configuración base y equipo preparado para trabajar.",
  },
  {
    icon: "speed",
    title: "Optimización real",
    text: "Limpieza lógica, inicio, almacenamiento, programas pesados y ajustes para recuperar fluidez.",
  },
  {
    icon: "wifi",
    title: "WiFi, redes e impresoras",
    text: "Configuración de red doméstica, impresoras, repetidores, periféricos y pequeños entornos de oficina.",
  },
  {
    icon: "diagnostic",
    title: "Diagnóstico claro",
    text: "Qué pasa, qué opciones hay, qué merece la pena reparar y cuándo conviene no gastar de más.",
  },
  {
    icon: "home",
    title: "Servicio a domicilio",
    text: `Desplazamiento en ${BUSINESS.serviceArea} para incidencias prácticas y equipos difíciles de mover.`,
  },
  {
    icon: "invoice",
    title: "Trato profesional",
    text: "Servicio preparado para particulares, autónomos, comercios y pequeñas empresas.",
  },
];

const STEPS = [
  {
    icon: "chat",
    title: "Contacto rápido",
    text: "Me explicas síntomas, equipo, urgencia y ubicación por WhatsApp, llamada o formulario.",
  },
  {
    icon: "clipboard",
    title: "Diagnóstico y presupuesto",
    text: "Te doy una orientación clara, opciones viables y prioridad antes de tocar nada sensible.",
  },
  {
    icon: "wrench",
    title: "Reparación y entrega",
    text: "Intervención limpia, pruebas finales y recomendaciones sencillas para evitar recaídas.",
  },
];

const PRICE_CARDS = [
  {
    eyebrow: "Entrada",
    title: "Diagnóstico inicial",
    text: "Revisión del caso y ruta de solución antes de avanzar.",
    points: ["Sin compromiso", "Explicación clara", "Prioridad según urgencia"],
  },
  {
    eyebrow: "Mejora",
    title: "SSD, RAM y rendimiento",
    text: "La opción fuerte para ordenadores lentos que todavía pueden rendir muy bien.",
    points: ["Componentes adecuados", "Instalación limpia", "Optimización final"],
    featured: true,
  },
  {
    eyebrow: "Sistema",
    title: "Reinstalación completa",
    text: "Sistema limpio, drivers, configuración base y equipo listo para usar.",
    points: ["Sistema operativo", "Drivers y apps", "Equipo preparado"],
  },
];

const FAQS = [
  {
    question: "¿Trabajas a domicilio?",
    answer: `Sí. Servicio a domicilio en ${BUSINESS.serviceArea}.`,
  },
  {
    question: "¿Puedo pedir presupuesto sin compromiso?",
    answer: "Sí. Primero revisamos el caso y te doy una orientación clara antes de avanzar.",
  },
  {
    question: "¿Emites factura?",
    answer: `Sí. ${BUSINESS.invoiceText} para particulares, autónomos y empresas.`,
  },
  {
    question: "¿Qué datos debo enviar?",
    answer: "Modelo del equipo, qué ocurre, desde cuándo pasa, mensajes de error y si necesitas servicio a domicilio.",
  },
];

function renderLogo({ compact = false } = {}) {
  const logoSrc = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);

  return `
    <span class="public-home-brand-mark" aria-hidden="true">
      <img class="public-home-brand-logo" src="${escapeAttr(logoSrc)}" alt="" width="44" height="44" loading="eager" decoding="async" draggable="false">
    </span>
    <span class="public-home-brand-copy">
      <span class="public-home-brand-name"><span>ONION</span><strong>SUPPORT</strong></span>
      ${compact ? "" : `<span class="public-home-brand-subtitle">${escapeHtml(BUSINESS.legalServiceName)}</span>`}
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
    <li class="public-home-trust-item" data-public-home-reveal="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-trust-icon" aria-hidden="true">${renderIcon(item.icon)}</span>
      <span>${escapeHtml(item.label)}</span>
    </li>
  `).join("");
}

function renderHeroMetrics() {
  return HERO_METRICS.map((metric, index) => `
    <li class="public-home-metric" data-public-home-reveal="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <strong data-public-home-counter="true" data-counter-target="${escapeAttr(metric.value)}" data-counter-suffix="${escapeAttr(metric.suffix)}">${escapeHtml(metric.value)}${escapeHtml(metric.suffix)}</strong>
      <span>${escapeHtml(metric.label)}</span>
    </li>
  `).join("");
}

function renderServices() {
  return SERVICES.map((service, index) => `
    <article class="public-home-service-card" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-service-icon" aria-hidden="true">${renderIcon(service.icon)}</span>
      <h3>${escapeHtml(service.title)}</h3>
      <p>${escapeHtml(service.text)}</p>
    </article>
  `).join("");
}

function renderSteps() {
  return STEPS.map((step, index) => `
    <article class="public-home-step" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
      <span class="public-home-step-number" aria-hidden="true">${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <span class="public-home-step-icon" aria-hidden="true">${renderIcon(step.icon)}</span>
      <h3>${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.text)}</p>
    </article>
  `).join("");
}

function renderPriceCards() {
  return PRICE_CARDS.map((card, index) => {
    const featured = Boolean(card.featured);

    return `
      <article class="public-home-price-card ${featured ? "public-home-price-card--featured" : ""}" data-featured="${featured ? "true" : "false"}" data-public-home-reveal="true" data-public-home-magnetic="true" style="--public-home-reveal-index:${escapeAttr(index)};">
        ${featured ? `<span class="public-home-price-badge">Más solicitado</span>` : ""}
        <p class="public-home-price-eyebrow">${escapeHtml(card.eyebrow)}</p>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
        <ul class="public-home-price-points">
          ${(card.points || []).map((point) => `
            <li><span aria-hidden="true">${renderIcon("check")}</span><span>${escapeHtml(point)}</span></li>
          `).join("")}
        </ul>
        <a class="public-home-price-link" href="${escapeAttr(whatsappHref(`Hola Cristian, vengo desde Onion Support. Quiero consultar sobre: ${card.title}.`))}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
          Consultar ${renderIcon("arrow")}
        </a>
      </article>
    `;
  }).join("");
}

function renderFaqs() {
  return FAQS.map((faq, index) => `
    <details class="public-home-faq-item" data-public-home-reveal="true" ${index === 0 ? "open" : ""}>
      <summary>${escapeHtml(faq.question)}</summary>
      <p>${escapeHtml(faq.answer)}</p>
    </details>
  `).join("");
}

function renderContactCards() {
  return `
    <div class="public-home-contact-cards">
      <a class="public-home-contact-card public-home-contact-card--primary" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true" data-public-home-magnetic="true">
        <span class="public-home-contact-icon" aria-hidden="true">${renderIcon("whatsapp")}</span>
        <span><strong>WhatsApp directo</strong><small>${escapeHtml(BUSINESS.phoneDisplay)}</small></span>
      </a>
      <a class="public-home-contact-card" href="${escapeAttr(telHref())}" data-public-home-cta="true" data-public-home-copy="${escapeAttr(BUSINESS.phoneDisplay)}" data-copy-value="${escapeAttr(BUSINESS.phoneDisplay)}" data-public-home-magnetic="true">
        <span class="public-home-contact-icon" aria-hidden="true">${renderIcon("phone")}</span>
        <span><strong>Llamar</strong><small>${escapeHtml(BUSINESS.phoneDisplay)}</small></span>
      </a>
      <a class="public-home-contact-card" href="${escapeAttr(mailHref())}" data-public-home-cta="true" data-public-home-copy="${escapeAttr(BUSINESS.email)}" data-copy-value="${escapeAttr(BUSINESS.email)}" data-public-home-magnetic="true">
        <span class="public-home-contact-icon" aria-hidden="true">${renderIcon("mail")}</span>
        <span><strong>Email</strong><small>${escapeHtml(BUSINESS.email)}</small></span>
      </a>
      <button class="public-home-contact-card public-home-contact-card--address" type="button" data-public-home-copy="${escapeAttr(BUSINESS.addressFull)}" data-copy-value="${escapeAttr(BUSINESS.addressFull)}" data-public-home-magnetic="true">
        <span class="public-home-contact-icon" aria-hidden="true">${renderIcon("location")}</span>
        <span><strong>${escapeHtml(BUSINESS.locationShort)}</strong><small>${escapeHtml(BUSINESS.addressFull)}</small></span>
      </button>
    </div>
  `;
}

function renderHeader() {
  const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");

  return `
    <header class="public-home-nav" data-public-home-nav="true">
      <span class="public-home-nav-progress" aria-hidden="true"></span>
      <div class="public-home-nav-inner">
        <a class="public-home-brand" href="#inicio" aria-label="${escapeAttr(BUSINESS.name)}" data-public-home-scroll-link="true">${renderLogo()}</a>
        <nav class="public-home-nav-panel" id="public-home-nav-panel" aria-label="Navegación principal" data-public-home-nav-panel="true">
          <div class="public-home-nav-menu" data-public-home-menu="true">${renderNavLinks()}</div>
          <div class="public-home-nav-actions">
            <a class="public-home-login-link" href="${escapeAttr(loginHref)}" data-spa="true" data-router-link="true" data-route="${escapeAttr(loginHref)}" data-href="${escapeAttr(loginHref)}" data-public-home-login="true">Panel cliente</a>
            <a class="public-home-nav-cta" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">
              <span aria-hidden="true">${renderIcon("whatsapp")}</span><span>Solicitar diagnóstico</span>
            </a>
          </div>
        </nav>
        <button class="public-home-nav-toggle" type="button" aria-label="Abrir menú" aria-controls="public-home-nav-panel" aria-expanded="false" data-public-home-nav-toggle="true">
          <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--open" aria-hidden="true">${renderIcon("menu")}</span>
          <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--close" aria-hidden="true">${renderIcon("close")}</span>
        </button>
      </div>
    </header>
  `;
}

function renderHeroVisual() {
  return `
    <div class="public-home-command" data-public-home-magnetic="true">
      <div class="public-home-command-top">
        <span></span><span></span><span></span>
        <strong>ONION SUPPORT</strong>
      </div>
      <div class="public-home-command-grid">
        <div class="public-home-device-card public-home-device-card--main">
          <div class="public-home-device-screen">
            <div class="public-home-device-toolbar"><span></span><span></span><span></span></div>
            <div class="public-home-status-row"><span>Diagnóstico</span><strong>Listo</strong></div>
            <div class="public-home-status-row"><span>Hardware</span><strong>OK</strong></div>
            <div class="public-home-status-row"><span>Ruta cliente</span><strong>WhatsApp</strong></div>
            <div class="public-home-status-row"><span>Factura</span><strong>2026</strong></div>
          </div>
        </div>
        <div class="public-home-device-card public-home-device-card--side">
          <span class="public-home-device-icon">${renderIcon("shield")}</span>
          <strong>Diagnóstico seguro</strong>
          <small>Antes de reparar, claridad.</small>
        </div>
        <div class="public-home-device-card public-home-device-card--side public-home-device-card--invoice">
          <span class="public-home-device-icon">${renderIcon("invoice")}</span>
          <strong>Factura disponible</strong>
          <small>Particulares y negocios.</small>
        </div>
        <div class="public-home-device-card public-home-device-card--network">
          <span class="public-home-ring"></span>
          <span class="public-home-ring"></span>
          <span class="public-home-ring"></span>
          <small>SSD · RAM · WiFi · Sistema</small>
        </div>
      </div>
      <div class="public-home-command-footer">
        <span>${renderIcon("location")} ${escapeHtml(BUSINESS.locationShort)}</span>
        <span>${renderIcon("whatsapp")} ${escapeHtml(BUSINESS.phoneDisplay)}</span>
      </div>
    </div>
  `;
}

function renderHero() {
  return `
    <section class="public-home-section public-home-hero" id="inicio" data-public-home-section="inicio" aria-labelledby="public-home-title">
      <div class="public-home-hero-bg" aria-hidden="true"></div>
      <div class="public-home-hero-grid">
        <div class="public-home-hero-copy">
          <p class="public-home-kicker" data-public-home-reveal="true"><span aria-hidden="true">${renderIcon("shield")}</span><span>${escapeHtml(BUSINESS.legalServiceName)} en ${escapeHtml(BUSINESS.locationShort)}</span></p>
          <h1 class="public-home-title" id="public-home-title" data-public-home-reveal="true">
            Reparación informática profesional
            <span>a domicilio.</span>
          </h1>
          <p class="public-home-hero-text" data-public-home-reveal="true">
            Ordenadores, portátiles, redes, impresoras y puesta a punto con diagnóstico claro, presupuesto previo y factura en ${escapeHtml(BUSINESS.locationFull)}.
          </p>
          <div class="public-home-hero-actions" data-public-home-reveal="true">
            <a class="public-home-button public-home-button--primary" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true"><span>Pedir diagnóstico</span>${renderIcon("whatsapp")}</a>
            <a class="public-home-button public-home-button--secondary" href="#servicios" data-public-home-scroll-link="true"><span>Ver servicios</span>${renderIcon("arrow")}</a>
          </div>
          <ul class="public-home-trust-list" aria-label="Ventajas principales">${renderTrustItems()}</ul>
          <ul class="public-home-metrics" aria-label="Datos clave">${renderHeroMetrics()}</ul>
        </div>
        <div class="public-home-hero-visual" aria-hidden="true" data-public-home-reveal="true">${renderHeroVisual()}</div>
      </div>
    </section>
  `;
}

function renderServiceSection() {
  return `
    <section class="public-home-section public-home-services" id="servicios" data-public-home-section="servicios" aria-labelledby="public-home-services-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <p class="public-home-section-kicker">Servicios</p>
        <h2 id="public-home-services-title">Servicio técnico claro, rápido y vendible.</h2>
        <p>Una página pública tiene que convertir: explicar qué haces, generar confianza y llevar al contacto sin ruido.</p>
      </div>
      <div class="public-home-service-grid">${renderServices()}</div>
    </section>
  `;
}

function renderHowSection() {
  return `
    <section class="public-home-section public-home-how" id="como-trabajo" data-public-home-section="como-trabajo" aria-labelledby="public-home-how-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <p class="public-home-section-kicker">Método</p>
        <h2 id="public-home-how-title">Diagnóstico claro. Reparación limpia. Entrega comprobada.</h2>
        <p>Proceso sencillo para que el cliente entienda el problema, el coste y el siguiente paso.</p>
      </div>
      <div class="public-home-step-grid">${renderSteps()}</div>
    </section>
  `;
}

function renderPricesSection() {
  return `
    <section class="public-home-section public-home-prices" id="precios" data-public-home-section="precios" aria-labelledby="public-home-prices-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <p class="public-home-section-kicker">Precios</p>
        <h2 id="public-home-prices-title">Presupuesto antes de empezar.</h2>
        <p>Cada avería es distinta. Primero se revisa el caso y se propone una solución con criterio.</p>
      </div>
      <div class="public-home-price-grid">${renderPriceCards()}</div>
    </section>
  `;
}

function renderDiagnosticForm() {
  return `
    <form class="public-home-diagnostic-form" data-public-home-diagnostic-form="true" data-whatsapp-phone="${escapeAttr(BUSINESS.phoneInternational)}" autocomplete="on" novalidate>
      <div class="public-home-form-grid">
        <div class="public-home-field">
          <label for="public-home-name">Nombre</label>
          <input id="public-home-name" name="nombre" type="text" placeholder="Tu nombre" autocomplete="name" data-label="Nombre">
          <p class="public-home-field-error" id="public-home-name-error" data-public-home-error-for="nombre" hidden></p>
        </div>
        <div class="public-home-field">
          <label for="public-home-contact">Teléfono o email</label>
          <input id="public-home-contact" name="contacto" type="text" placeholder="Dónde te respondo" autocomplete="tel" data-label="Contacto" required>
          <p class="public-home-field-error" id="public-home-contact-error" data-public-home-error-for="contacto" hidden></p>
        </div>
        <div class="public-home-field">
          <label for="public-home-device">Equipo</label>
          <input id="public-home-device" name="equipo" type="text" placeholder="Portátil, sobremesa, impresora..." autocomplete="off" data-label="Equipo">
          <p class="public-home-field-error" id="public-home-device-error" data-public-home-error-for="equipo" hidden></p>
        </div>
        <div class="public-home-field">
          <label for="public-home-urgency">Urgencia</label>
          <select id="public-home-urgency" name="urgencia" data-label="Urgencia">
            <option value="Normal">Normal</option>
            <option value="Alta">Alta</option>
            <option value="Crítica">Crítica</option>
          </select>
          <p class="public-home-field-error" id="public-home-urgency-error" data-public-home-error-for="urgencia" hidden></p>
        </div>
        <div class="public-home-field public-home-field--wide">
          <label for="public-home-issue">¿Qué ocurre?</label>
          <textarea id="public-home-issue" name="incidencia" rows="5" placeholder="Ej: va lento, no arranca, necesito SSD, no conecta WiFi..." data-label="Incidencia" required></textarea>
          <p class="public-home-field-error" id="public-home-issue-error" data-public-home-error-for="incidencia" hidden></p>
        </div>
      </div>
      <div class="public-home-form-actions">
        <button class="public-home-button public-home-button--primary public-home-form-submit" type="submit"><span>Preparar WhatsApp</span>${renderIcon("whatsapp")}</button>
        <p class="public-home-form-status" role="status" aria-live="polite" data-public-home-form-status="true" hidden></p>
      </div>
      <p class="public-home-form-note">Al enviar se abrirá WhatsApp con el mensaje preparado. No se guarda ningún dato en esta pantalla.</p>
    </form>
  `;
}

function renderContactSection() {
  return `
    <section class="public-home-section public-home-contact" id="contacto" data-public-home-section="contacto" aria-labelledby="public-home-contact-title">
      <div class="public-home-contact-grid">
        <div class="public-home-contact-copy">
          <div class="public-home-section-head public-home-section-head--left" data-public-home-reveal="true">
            <p class="public-home-section-kicker">Contacto</p>
            <h2 id="public-home-contact-title">Cuéntame qué falla y te doy el siguiente paso.</h2>
            <p>Atención en ${escapeHtml(BUSINESS.addressFull)}. ${escapeHtml(BUSINESS.invoiceText)}.</p>
          </div>
          ${renderContactCards()}
          <div class="public-home-contact-proof" data-public-home-reveal="true">
            <span aria-hidden="true">${renderIcon("lock")}</span>
            <p>Sin mareos: primero diagnóstico, luego presupuesto, después reparación.</p>
          </div>
        </div>
        <div class="public-home-contact-panel" data-public-home-reveal="true" data-public-home-magnetic="true">
          <div class="public-home-contact-panel-head">
            <span aria-hidden="true">${renderIcon("diagnostic")}</span>
            <div><h3>Diagnóstico rápido</h3><p>Rellena lo básico y se abrirá WhatsApp con el mensaje listo.</p></div>
          </div>
          ${renderDiagnosticForm()}
        </div>
      </div>
    </section>
  `;
}

function renderFaqSection() {
  return `
    <section class="public-home-section public-home-faq" id="faq" data-public-home-section="faq" aria-labelledby="public-home-faq-title">
      <div class="public-home-section-head" data-public-home-reveal="true">
        <p class="public-home-section-kicker">FAQ</p>
        <h2 id="public-home-faq-title">Dudas rápidas antes de escribir.</h2>
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
          <a href="#servicios" data-public-home-scroll-link="true">Servicios</a>
          <a href="#como-trabajo" data-public-home-scroll-link="true">Método</a>
          <a href="#precios" data-public-home-scroll-link="true">Precios</a>
          <a href="#contacto" data-public-home-scroll-link="true">Contacto</a>
          <a href="#faq" data-public-home-scroll-link="true">FAQ</a>
          <a href="${escapeAttr(loginHref)}" data-spa="true" data-router-link="true" data-route="${escapeAttr(loginHref)}" data-public-home-login="true">Panel cliente</a>
        </div>
        <div class="public-home-footer-contact">
          <a href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" data-public-home-cta="true">${renderIcon("whatsapp")}<span>${escapeHtml(BUSINESS.phoneDisplay)}</span></a>
          <a href="${escapeAttr(mailHref())}" data-public-home-cta="true">${renderIcon("mail")}<span>${escapeHtml(BUSINESS.email)}</span></a>
        </div>
      </div>
      <div class="public-home-footer-bottom">
        <p>© ${escapeHtml(BUSINESS.copyrightYear)} ${escapeHtml(BUSINESS.name)}. Todos los derechos reservados.</p>
        <p>${escapeHtml(BUSINESS.addressFull)} · ${escapeHtml(BUSINESS.invoiceText)}.</p>
      </div>
    </footer>
  `;
}

function renderFloatingWhatsApp() {
  return `
    <a class="public-home-floating-whatsapp" href="${escapeAttr(whatsappHref())}" target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp al ${escapeAttr(BUSINESS.phoneDisplay)}" data-public-home-cta="true">
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
        data-business-address="${escapeAttr(BUSINESS.addressFull)}"
      >
        ${renderJsonLd()}
        <div class="public-home-background" aria-hidden="true">
          <span class="public-home-bg-orb public-home-bg-orb--one"></span>
          <span class="public-home-bg-orb public-home-bg-orb--two"></span>
          <span class="public-home-bg-orb public-home-bg-orb--three"></span>
          <span class="public-home-bg-grid"></span>
          <span class="public-home-bg-noise"></span>
        </div>
        ${renderHeader()}
        <div class="public-home-content" data-public-home-main="true">
          ${renderHero()}
          ${renderServiceSection()}
          ${renderHowSection()}
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
