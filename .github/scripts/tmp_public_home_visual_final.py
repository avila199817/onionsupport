#!/usr/bin/env python3
from pathlib import Path

INTAKE = Path('src/features/public-support/index.js')
CSS = Path('src/css/views/public/support-request.css')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


intake = INTAKE.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

intake = replace_once(
    intake,
    'export const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";\n',
    'export const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";\n'
    'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = "/src/media/img/Cristian_Avila_Formulario.png";\n',
    'technician photo constant',
)

intake = replace_once(
    intake,
    '        <h2 id="public-support-title">Abre tu incidencia ahora.</h2>',
    '''        <h2 id="public-support-title" class="public-support-title">
          <span>Abre tu</span>
          <span>incidencia</span>
          <span class="public-support-title-accent">ahora.</span>
        </h2>''',
    'headline',
)

flow_anchor = '''          <div class="public-support-flow-item"><span>03</span><div><strong>Cliente, solo por Onion Support</strong><p>La home no crea fichas de cliente. El equipo de Onion Support las gestiona después cuando corresponda.</p></div></div>
        </div>

        <p class="public-support-privacy">'''
portrait_markup = '''          <div class="public-support-flow-item"><span>03</span><div><strong>Cliente, solo por Onion Support</strong><p>La home no crea fichas de cliente. El equipo de Onion Support las gestiona después cuando corresponda.</p></div></div>
        </div>

        <figure class="public-support-person">
          <div class="public-support-person-visual">
            <img
              src="${PUBLIC_SUPPORT_TECHNICIAN_PHOTO}"
              alt="Cristian Ávila, soporte técnico de Onion Support"
              loading="lazy"
              decoding="async"
              fetchpriority="low">
          </div>
          <figcaption class="public-support-person-card">
            <strong>Cristian Ávila</strong>
            <span>Soporte técnico</span>
          </figcaption>
        </figure>

        <p class="public-support-privacy">'''
intake = replace_once(intake, flow_anchor, portrait_markup, 'portrait markup')

country_line = '          ${field("country", "País", "text", "España", "country-name", 90, "", "España", { readonly: true })}\n'
intake = replace_once(intake, country_line, '', 'country field')

province_line = '          ${field("province", "Provincia", "text", "Barcelona", "address-level1", 90)}'
postal_hint = '''          ${field("province", "Provincia", "text", "Barcelona", "address-level1", 90)}

          <div class="public-support-postal-hint public-support-field--wide">
            <span aria-hidden="true">i</span>
            <p>El código postal completa la provincia automáticamente. La ciudad permanece editable para que puedas indicar la localidad correcta.</p>
          </div>'''
intake = replace_once(intake, province_line, postal_hint, 'postal hint')

css = replace_once(
    css,
    '''  grid-template-columns: minmax(0, .80fr) minmax(560px, 1.20fr);
  gap: clamp(34px, 4.5vw, 76px);
  align-items: start;''',
    '''  grid-template-columns: minmax(0, .90fr) minmax(560px, 1.10fr);
  gap: clamp(34px, 4vw, 64px);
  align-items: stretch;''',
    'layout balance',
)

css = replace_once(
    css,
    '''.public-home .public-support-intro {
  position: sticky;
  inset-block-start: calc(var(--public-home-scroll-offset) + 16px);
  display: grid;
  gap: 20px;
  padding: clamp(10px, 1.5vw, 20px);
}''',
    '''.public-home .public-support-intro {
  position: sticky;
  inset-block-start: calc(var(--public-home-scroll-offset) + 16px);
  display: grid;
  align-content: start;
  gap: 18px;
  min-block-size: 690px;
  padding: clamp(10px, 1.5vw, 20px);
  overflow: visible;
}''',
    'intro layout',
)

css = replace_once(
    css,
    '''.public-home .public-support-lead {
  max-inline-size: 55ch;''',
    '''.public-home .public-support-intro h2 > span {
  display: block;
}

.public-home .public-support-title-accent {
  width: max-content;
  max-inline-size: 100%;
  color: transparent;
  background: linear-gradient(108deg, #64e6ff 0%, #1d9dff 48%, #1768ff 100%);
  background-clip: text;
  -webkit-background-clip: text;
  filter: drop-shadow(0 10px 25px rgb(19 148 255 / .16));
}

.public-home .public-support-lead {
  max-inline-size: 55ch;''',
    'title accent css',
)

css = replace_once(
    css,
    '''.public-home .public-support-flow {
  display: grid;
  gap: 10px;
  margin-block-start: 8px;
}''',
    '''.public-home .public-support-flow {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 10px;
  max-inline-size: 61%;
  margin-block-start: 8px;
}''',
    'flow width',
)

css = replace_once(
    css,
    '''.public-home .public-support-privacy {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 5px 0 0;''',
    '''.public-home .public-support-privacy {
  position: relative;
  z-index: 3;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  max-inline-size: 61%;
  margin: 5px 0 0;''',
    'privacy width',
)

portrait_css = '''/* =========================================================
   2B. HUMAN SUPPORT PROFILE
========================================================= */

.public-home .public-support-person {
  position: absolute;
  inset-inline-end: -8px;
  inset-block-end: 34px;
  z-index: 2;
  display: grid;
  justify-items: center;
  inline-size: clamp(230px, 24vw, 340px);
  margin: 0;
  pointer-events: none;
}

.public-home .public-support-person::before {
  content: "";
  position: absolute;
  inset: 12% -12% 17%;
  z-index: -2;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(28 153 255 / .30), rgb(13 100 255 / .11) 44%, transparent 72%);
  filter: blur(24px);
}

.public-home .public-support-person::after {
  content: "";
  position: absolute;
  inset: 16% -10% 21%;
  z-index: -1;
  border: 1px solid rgb(88 214 255 / .10);
  border-radius: 50%;
  box-shadow: 0 0 0 24px rgb(26 145 255 / .025), 0 0 0 52px rgb(26 145 255 / .018);
}

.public-home .public-support-person-visual {
  position: relative;
  z-index: 1;
  inline-size: 100%;
}

.public-home .public-support-person-visual img {
  display: block;
  inline-size: 100%;
  block-size: auto;
  margin: 0 auto;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 30px 42px rgb(0 0 0 / .42)) drop-shadow(0 0 28px rgb(13 126 255 / .08));
  transform: translateZ(0);
}

.public-home .public-support-person-card {
  position: relative;
  z-index: 4;
  display: grid;
  gap: 2px;
  min-inline-size: 72%;
  margin-block-start: -30px;
  padding: 12px 16px;
  border: 1px solid rgb(111 218 255 / .16);
  border-radius: 16px;
  background: linear-gradient(180deg, rgb(255 255 255 / .07), rgb(255 255 255 / .025)), rgb(3 13 28 / .82);
  box-shadow: 0 18px 46px rgb(0 0 0 / .30), inset 0 1px 0 rgb(255 255 255 / .07);
  text-align: start;
  backdrop-filter: blur(16px) saturate(1.12);
  -webkit-backdrop-filter: blur(16px) saturate(1.12);
}

.public-home .public-support-person-card strong {
  color: #ffffff;
  font-size: 15px;
  font-weight: 950;
  line-height: 1.2;
  letter-spacing: -.018em;
}

.public-home .public-support-person-card span {
  color: #55dfff;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
}'''
section3 = '''/* =========================================================
   3. FORM PANEL — EXTREME PASS
========================================================= */'''
css = replace_once(css, section3, portrait_css + '\n\n' + section3, 'portrait css')

postal_css = '''.public-home .public-support-field--wide {
  grid-column: 1 / -1;
}

.public-home .public-support-postal-hint {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin-block-start: -4px;
  padding: 10px 12px;
  border: 1px solid rgb(49 198 255 / .14);
  border-radius: 13px;
  color: #8ea4bc;
  background: rgb(13 83 143 / .055);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .025);
}

.public-home .public-support-postal-hint > span {
  display: grid;
  place-items: center;
  inline-size: 18px;
  block-size: 18px;
  border: 1px solid rgb(89 221 255 / .24);
  border-radius: 999px;
  color: #75e5ff;
  font-size: 10px;
  font-weight: 950;
}

.public-home .public-support-postal-hint p {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.45;
}'''
css = replace_once(
    css,
    '''.public-home .public-support-field--wide {
  grid-column: 1 / -1;
}''',
    postal_css,
    'postal hint css',
)

responsive_css = '''@media (max-width: 1180px) {
  .public-home .public-support-person {
    inline-size: clamp(210px, 23vw, 286px);
    inset-inline-end: -12px;
  }

  .public-home .public-support-flow,
  .public-home .public-support-privacy {
    max-inline-size: 64%;
  }
}

@media (max-width: 980px) {
  .public-home .public-support-intro {
    min-block-size: 0;
  }

  .public-home .public-support-flow,
  .public-home .public-support-privacy {
    max-inline-size: none;
  }

  .public-home .public-support-person {
    position: relative;
    inset: auto;
    z-index: 2;
    inline-size: min(330px, 64vw);
    margin: 0 auto -4px;
  }

  .public-home .public-support-person-card {
    min-inline-size: 68%;
  }
}

@media (max-width: 720px) {
  .public-home .public-support-person {
    inline-size: min(286px, 76vw);
  }

  .public-home .public-support-person-card {
    min-inline-size: 76%;
    margin-block-start: -24px;
  }
}

@media (max-width: 460px) {
  .public-home .public-support-person {
    inline-size: min(248px, 82vw);
  }

  .public-home .public-support-person-card {
    min-inline-size: 84%;
    padding: 10px 13px;
  }
}

'''
css = replace_once(
    css,
    '@media (prefers-reduced-motion: reduce) {',
    responsive_css + '@media (prefers-reduced-motion: reduce) {',
    'portrait responsive css',
)

INTAKE.write_text(intake, encoding='utf-8')
CSS.write_text(css, encoding='utf-8')
