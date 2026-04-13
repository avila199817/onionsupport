/* =========================================================
   Onion Support - Base Mail Template
   Archivo: src/mail/templates/base.template.js

   Responsabilidades:
   - renderizar layout base del email
   - aplicar shell visual común a todas las templates
   - reutilizar bloques de branding/header/footer
   - evitar duplicación de estructura HTML
========================================================= */

import {
  MAIL_THEME,
  renderDivider,
  renderFooter,
  renderHiddenPreheader,
  renderLogo,
} from "./blocks.js";

export function renderBaseMailTemplate({
  lang = "es",
  title = "Onion Support",
  preheader = "",
  body = "",
  showLogo = true,
  footerExtra = "",
} = {}) {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>

<body style="margin:0;padding:0;background:${MAIL_THEME.pageBg};">
  ${renderHiddenPreheader(preheader)}

  <div style="padding:40px 16px;font-family:${MAIL_THEME.fontFamily};">
    <div style="
      max-width:${MAIL_THEME.contentWidth};
      margin:0 auto;
      background:${MAIL_THEME.cardBg};
      border-radius:${MAIL_THEME.radiusCard};
      padding:32px;
      box-shadow:${MAIL_THEME.shadow};
      color:${MAIL_THEME.text};
    ">
      ${showLogo ? renderLogo() : ""}

      ${body}

      ${renderDivider()}
      ${renderFooter({ extra: footerExtra })}
    </div>
  </div>
</body>
</html>`;
}
