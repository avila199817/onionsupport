/* =========================================================
   Onion Support - Mail Template Blocks
   Archivo: src/mail/templates/blocks.js

   Responsabilidades:
   - exponer bloques reutilizables
   - centralizar estilos inline compartidos
   - mantener consistencia visual entre correos
========================================================= */

import { escapeHtml, normalizeUrl, safeText } from "./utils.js";

export const MAIL_BRAND = {
  appName: "Onion Support",
  logoUrl:
    "https://onionassets.z43.web.core.windows.net/media/img/Favicon/favicon_support.ico",
  copyright: "© 2026 Onion Support",
};

export const MAIL_THEME = {
  pageBg: "#f5f5f7",
  cardBg: "#ffffff",
  text: "#1d1d1f",
  muted: "#6e6e73",
  border: "#e5e5e7",
  primary: "#0066cc",
  primaryText: "#ffffff",
  success: "#107c41",
  warning: "#b26a00",
  danger: "#c62828",
  shadow: "0 12px 40px rgba(0,0,0,.12)",
  radiusCard: "14px",
  radiusButton: "8px",
  contentWidth: "520px",
  fontFamily: "Arial,Helvetica,sans-serif",
};

export function renderHiddenPreheader(text = "") {
  const safe = escapeHtml(text);
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MAIL_THEME.pageBg};">
      ${safe}
    </div>
  `;
}

export function renderLogo() {
  return `
    <div style="text-align:center;margin-bottom:20px;">
      <img
        src="${MAIL_BRAND.logoUrl}"
        alt="${escapeHtml(MAIL_BRAND.appName)}"
        width="48"
        height="48"
        style="display:inline-block;border:0;outline:none;text-decoration:none;"
      >
    </div>
  `;
}

export function renderHeader({
  title = "",
  subtitle = "",
} = {}) {
  return `
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="margin:0;font-weight:600;font-size:24px;line-height:1.25;color:${MAIL_THEME.text};">
        ${escapeHtml(title)}
      </h2>
      ${
        subtitle
          ? `
        <p style="margin:6px 0 0 0;color:${MAIL_THEME.muted};font-size:14px;line-height:1.5;">
          ${escapeHtml(subtitle)}
        </p>
      `
          : ""
      }
    </div>
  `;
}

export function renderParagraph(text = "", options = {}) {
  const {
    align = "left",
    color = MAIL_THEME.text,
    size = "14px",
    margin = "0 0 14px 0",
    html = false,
  } = options;

  return `
    <p style="
      margin:${margin};
      color:${color};
      font-size:${size};
      line-height:1.65;
      text-align:${align};
    ">
      ${html ? text : escapeHtml(text)}
    </p>
  `;
}

export function renderButton({
  label = "Abrir",
  href = "#",
  bg = MAIL_THEME.primary,
  color = MAIL_THEME.primaryText,
} = {}) {
  const safeHref = normalizeUrl(href, "#");

  return `
    <p style="text-align:center;margin:28px 0;">
      <a
        href="${escapeHtml(safeHref)}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display:inline-block;
          background:${bg};
          color:${color};
          padding:12px 22px;
          border-radius:${MAIL_THEME.radiusButton};
          text-decoration:none;
          font-size:14px;
          font-weight:600;
          line-height:1.2;
        "
      >
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}

export function renderNotice(text = "") {
  return `
    <p style="
      margin:16px 0 0 0;
      font-size:13px;
      line-height:1.6;
      color:${MAIL_THEME.muted};
    ">
      ${escapeHtml(text)}
    </p>
  `;
}

export function renderDivider() {
  return `
    <hr style="border:none;border-top:1px solid ${MAIL_THEME.border};margin:24px 0;">
  `;
}

export function renderFooter({
  copyright = MAIL_BRAND.copyright,
  extra = "",
} = {}) {
  return `
    <div style="margin-top:8px;">
      ${
        extra
          ? `
        <p style="font-size:12px;color:${MAIL_THEME.muted};text-align:center;line-height:1.6;margin:0 0 8px 0;">
          ${extra}
        </p>
      `
          : ""
      }

      <p style="font-size:12px;color:${MAIL_THEME.muted};text-align:center;line-height:1.6;margin:0;">
        ${escapeHtml(copyright)}
      </p>
    </div>
  `;
}

export function renderGreeting(name = "") {
  const safeName = escapeHtml(safeText(name, "usuario"));
  return `
    <p style="margin:0 0 14px 0;font-size:14px;line-height:1.65;color:${MAIL_THEME.text};">
      Hola <strong>${safeName}</strong>,
    </p>
  `;
}
