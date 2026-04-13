/* =========================================================
   Onion SPA - Login Styles
   Archivo: src/views/login/login.styles.js

   Responsabilidades:
   - encapsular los estilos del login
   - inyectar css una sola vez
   - consumir design tokens globales
   - respetar dark / light theme sin hardcodes locales
========================================================= */

export const LOGIN_VIEW_STYLE_ID = "onion-login-view-styles";

export function getLoginStyles() {
  return `
    /* =========================================================
       Onion SPA - Login View Styles
       Scoped a .login-view
    ========================================================= */

    .login-view {
      min-height: calc(100vh - var(--app-safe-top, 0px));
      display: grid;
      place-items: center;
      padding:
        calc(var(--space-4xl) + var(--app-safe-top, 0px))
        max(var(--content-padding, 32px), 18px)
        max(calc(var(--space-4xl) + var(--app-safe-bottom, 0px)), 32px);
      background:
        var(--app-noise, none),
        var(--gradient-overlay, none),
        var(--body-bg, var(--main-bg, #111));
      color: var(--text, #fff);
      position: relative;
      isolation: isolate;
    }

    .login-view::before,
    .login-view::after {
      content: "";
      position: absolute;
      inset: auto;
      pointer-events: none;
      z-index: 0;
      filter: blur(20px);
      opacity: .85;
    }

    .login-view::before {
      width: 360px;
      height: 360px;
      top: 5%;
      left: max(-120px, -6vw);
      border-radius: 999px;
      background:
        radial-gradient(
          circle,
          var(--accent-soft, rgba(127,127,127,.14)) 0%,
          transparent 68%
        );
    }

    .login-view::after {
      width: 420px;
      height: 420px;
      right: max(-140px, -8vw);
      bottom: 0;
      border-radius: 999px;
      background:
        radial-gradient(
          circle,
          var(--brand-3-soft, rgba(127,127,127,.12)) 0%,
          transparent 68%
        );
    }

    .login-view__shell {
      width: min(100%, var(--auth-max-width, 1180px));
      display: grid;
      grid-template-columns:
        minmax(0, 1.05fr)
        minmax(360px, var(--auth-card-width, 460px));
      gap: clamp(20px, 4vw, 44px);
      align-items: stretch;
      position: relative;
      z-index: 1;
    }

    .login-view__hero,
    .login-view__card {
      border-radius: var(--card-radius-lg, 30px);
      border: 1px solid var(--auth-card-border, var(--card-border, rgba(255,255,255,.08)));
      box-shadow: var(--auth-card-shadow, var(--shadow-lg));
      backdrop-filter: var(--blur-lg, blur(20px));
      -webkit-backdrop-filter: var(--blur-lg, blur(20px));
      overflow: hidden;
      position: relative;
    }

    .login-view__hero {
      background:
        var(--glass-shine, none),
        var(--panel-noise, none),
        var(--panel-bg, var(--card-bg, var(--surface-elevated, rgba(0,0,0,.2))));
      min-height: 640px;
      padding: clamp(28px, 4vw, 44px);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 28px;
    }

    .login-view__hero::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 10% 0%, var(--accent-soft, rgba(127,127,127,.12)), transparent 30%),
        radial-gradient(circle at 100% 20%, var(--brand-3-soft, rgba(127,127,127,.10)), transparent 28%);
      pointer-events: none;
      opacity: .9;
    }

    .login-view__hero-inner,
    .login-view__hero-kpis {
      position: relative;
      z-index: 1;
    }

    .login-view__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--badge-border, var(--border-soft));
      background: var(--badge-bg, var(--surface-glass));
      color: var(--badge-text, var(--text-muted));
      font-size: var(--font-sm, 12px);
      font-weight: var(--weight-semibold, 600);
      letter-spacing: var(--letter-wide, .02em);
      text-transform: uppercase;
      width: fit-content;
    }

    .login-view__brand {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 18px;
    }

    .login-view__logo {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: var(--gradient-accent, var(--btn-primary-bg));
      color: var(--text-on-accent, #fff);
      box-shadow: var(--auth-logo-glow, var(--shadow-glow));
      border: 1px solid var(--border-accent, transparent);
      flex: 0 0 auto;
    }

    .login-view__logo svg {
      width: 28px;
      height: 28px;
      display: block;
    }

    .login-view__brand-copy {
      min-width: 0;
    }

    .login-view__brand-title {
      margin: 0;
      color: var(--text-strong, #fff);
      font-size: clamp(22px, 3vw, 34px);
      line-height: var(--line-tight, 1.1);
      letter-spacing: var(--letter-tight, -.03em);
      font-weight: var(--weight-black, 800);
    }

    .login-view__brand-subtitle {
      margin: 6px 0 0;
      color: var(--text-muted, rgba(255,255,255,.7));
      font-size: var(--font-lg, 16px);
      line-height: var(--line-normal, 1.46);
      max-width: 56ch;
    }

    .login-view__bullets {
      display: grid;
      gap: 12px;
      margin-top: 30px;
    }

    .login-view__bullet {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      border-radius: var(--radius-lg, 20px);
      border: 1px solid var(--block-border, var(--border-soft));
      background: var(--block-bg, rgba(255,255,255,.03));
      color: var(--text-soft, rgba(255,255,255,.88));
      min-width: 0;
    }

    .login-view__bullet-icon {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--accent-soft, rgba(127,127,127,.14));
      color: var(--accent, currentColor);
      flex: 0 0 auto;
      border: 1px solid var(--border-accent, transparent);
    }

    .login-view__bullet strong {
      display: block;
      margin-bottom: 3px;
      color: var(--text-strong, #fff);
      font-size: var(--font-base, 14px);
      font-weight: var(--weight-semibold, 600);
    }

    .login-view__bullet span {
      display: block;
      color: var(--text-muted, rgba(255,255,255,.7));
      font-size: var(--font-md, 13px);
      line-height: var(--line-normal, 1.46);
    }

    .login-view__hero-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .login-view__kpi {
      min-height: 108px;
      padding: 18px;
      border-radius: var(--radius-xl, 24px);
      border: 1px solid var(--card-border, var(--border-soft));
      background: var(--card-bg, var(--surface-elevated));
      box-shadow: var(--shadow-soft, 0 10px 24px rgba(0,0,0,.14));
    }

    .login-view__kpi-label {
      display: block;
      color: var(--text-dim, rgba(255,255,255,.5));
      font-size: var(--font-sm, 12px);
      font-weight: var(--weight-medium, 500);
      margin-bottom: 10px;
    }

    .login-view__kpi-value {
      display: block;
      color: var(--text-strong, #fff);
      font-size: clamp(20px, 2.8vw, 28px);
      line-height: var(--line-tight, 1.1);
      font-weight: var(--weight-bold, 700);
      letter-spacing: var(--letter-tight, -.03em);
    }

    .login-view__kpi-note {
      display: block;
      margin-top: 8px;
      color: var(--text-muted, rgba(255,255,255,.7));
      font-size: var(--font-sm, 12px);
    }

    .login-view__card {
      background:
        var(--glass-shine, none),
        var(--auth-card-bg, var(--card-bg, var(--surface-elevated, rgba(0,0,0,.2))));
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 640px;
    }

    .login-view__card-inner {
      padding: clamp(26px, 4vw, 38px);
    }

    .login-view__card-top {
      margin-bottom: 26px;
    }

    .login-view__title {
      margin: 0 0 8px;
      color: var(--text-strong, #fff);
      font-size: clamp(24px, 3vw, 34px);
      line-height: var(--line-tight, 1.1);
      letter-spacing: var(--letter-tight, -.03em);
      font-weight: var(--weight-black, 800);
    }

    .login-view__subtitle {
      margin: 0;
      color: var(--text-muted, rgba(255,255,255,.7));
      font-size: var(--font-base, 14px);
      line-height: var(--line-relaxed, 1.68);
    }

    .login-view__form {
      display: grid;
      gap: 16px;
    }

    .login-view__field {
      display: grid;
      gap: 8px;
    }

    .login-view__label {
      color: var(--text-soft, rgba(255,255,255,.88));
      font-size: var(--font-sm, 12px);
      font-weight: var(--weight-semibold, 600);
      letter-spacing: var(--letter-wide, .02em);
      text-transform: uppercase;
    }

    .login-view__control {
      position: relative;
    }

    .login-view__input {
      width: 100%;
      height: var(--input-height, 52px);
      padding: 0 16px 0 48px;
      border-radius: var(--input-radius, 16px);
      border: 1px solid var(--auth-input-border, var(--input-border));
      background: var(--auth-input-bg, var(--input-bg));
      color: var(--input-text, var(--text));
      outline: none;
      font: inherit;
      transition:
        border-color var(--duration-normal, .22s) var(--ease-standard, ease),
        box-shadow var(--duration-normal, .22s) var(--ease-standard, ease),
        background var(--duration-normal, .22s) var(--ease-standard, ease),
        transform var(--duration-normal, .22s) var(--ease-standard, ease);
      box-shadow: var(--input-shadow, inset 0 1px 0 rgba(255,255,255,.04));
    }

    .login-view__input::placeholder {
      color: var(--input-placeholder, var(--text-dim));
    }

    .login-view__input:hover {
      background: var(--input-bg-hover, var(--auth-input-bg, var(--input-bg)));
      border-color: var(--input-border-hover, var(--auth-input-border, var(--input-border)));
      box-shadow: var(--input-shadow-hover, var(--input-shadow));
    }

    .login-view__input:focus {
      background: var(--input-bg-focus, var(--auth-input-bg, var(--input-bg)));
      border-color: var(--auth-input-border-focus, var(--input-border-focus, var(--accent)));
      box-shadow: var(--input-shadow-focus, var(--focus-ring));
    }

    .login-view__field.is-invalid .login-view__input {
      border-color: var(--input-border-error, var(--error));
      box-shadow:
        0 0 0 4px color-mix(in srgb, var(--error) 14%, transparent),
        var(--input-shadow, inset 0 1px 0 rgba(255,255,255,.04));
    }

    .login-view__icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      color: var(--input-icon, var(--text-dim));
      pointer-events: none;
      opacity: .95;
    }

    .login-view__toggle-pass {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      height: 34px;
      min-width: 34px;
      padding: 0 10px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--text-dim, rgba(255,255,255,.5));
      cursor: pointer;
      transition:
        background var(--duration-fast, .12s) var(--ease-standard, ease),
        color var(--duration-fast, .12s) var(--ease-standard, ease);
    }

    .login-view__toggle-pass:hover,
    .login-view__toggle-pass:focus-visible {
      background: var(--surface-hover, rgba(255,255,255,.03));
      color: var(--text-soft, rgba(255,255,255,.88));
      outline: none;
    }

    .login-view__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 2px;
      flex-wrap: wrap;
    }

    .login-view__checkbox {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text-muted, rgba(255,255,255,.7));
      font-size: var(--font-sm, 12px);
      cursor: pointer;
      user-select: none;
    }

    .login-view__checkbox input {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
    }

    .login-view__link {
      color: var(--link, var(--accent));
      text-decoration: none;
      font-weight: var(--weight-semibold, 600);
    }

    .login-view__link:hover {
      color: var(--link-hover, var(--accent-hover, var(--accent)));
      text-decoration: underline;
    }

    .login-view__error {
      min-height: 20px;
      color: var(--error, #ef4444);
      font-size: var(--font-sm, 12px);
      line-height: var(--line-normal, 1.46);
    }

    .login-view__actions {
      display: grid;
      gap: 12px;
      margin-top: 6px;
    }

    .login-view__submit,
    .login-view__secondary {
      width: 100%;
      min-height: var(--btn-height, 52px);
      border-radius: var(--btn-radius, 16px);
      font: inherit;
      font-weight: var(--weight-semibold, 600);
      transition:
        transform var(--duration-fast, .12s) var(--ease-standard, ease),
        border-color var(--duration-normal, .22s) var(--ease-standard, ease),
        background var(--duration-normal, .22s) var(--ease-standard, ease),
        box-shadow var(--duration-normal, .22s) var(--ease-standard, ease),
        opacity var(--duration-normal, .22s) var(--ease-standard, ease);
      cursor: pointer;
    }

    .login-view__submit {
      border: 1px solid var(--btn-primary-border, transparent);
      color: var(--btn-primary-text, #fff);
      background: var(--btn-primary-bg, var(--accent));
      box-shadow: var(--btn-primary-shadow, var(--shadow-md));
    }

    .login-view__submit:hover,
    .login-view__submit:focus-visible {
      background: var(--btn-primary-bg-hover, var(--btn-primary-bg, var(--accent)));
      transform: translateY(-1px);
      outline: none;
    }

    .login-view__submit:active {
      background: var(--btn-primary-bg-active, var(--btn-primary-bg, var(--accent)));
      transform: translateY(0);
    }

    .login-view__secondary {
      border: 1px solid var(--btn-secondary-border, var(--border-soft));
      color: var(--btn-secondary-text, var(--text));
      background: var(--btn-secondary-bg, var(--surface-hover));
      box-shadow: var(--btn-secondary-shadow, none);
    }

    .login-view__secondary:hover,
    .login-view__secondary:focus-visible {
      background: var(--btn-secondary-bg-hover, var(--surface-hover-strong));
      outline: none;
    }

    .login-view__submit[disabled],
    .login-view__secondary[disabled] {
      opacity: .6;
      cursor: wait;
      transform: none;
    }

    .login-view__footer {
      margin-top: 18px;
      color: var(--text-dim, rgba(255,255,255,.5));
      font-size: var(--font-sm, 12px);
      line-height: var(--line-relaxed, 1.68);
      text-align: center;
    }

    .login-view__spinner {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      border: 2px solid color-mix(in srgb, var(--btn-primary-text, #fff) 26%, transparent);
      border-top-color: var(--btn-primary-text, #fff);
      animation: onion-login-spin .72s linear infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }

    .login-view__sr {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @keyframes onion-login-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 980px) {
      .login-view__shell {
        grid-template-columns: 1fr;
      }

      .login-view__hero {
        min-height: unset;
      }

      .login-view__card {
        min-height: unset;
      }
    }

    @media (max-width: 640px) {
      .login-view {
        padding:
          calc(var(--space-2xl) + var(--app-safe-top, 0px))
          max(var(--space-md, 16px), 14px)
          max(calc(var(--space-2xl) + var(--app-safe-bottom, 0px)), 24px);
      }

      .login-view__hero-kpis {
        grid-template-columns: 1fr;
      }

      .login-view__brand {
        align-items: flex-start;
      }
    }
  `;
}

export function injectLoginStylesOnce() {
  if (document.getElementById(LOGIN_VIEW_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = LOGIN_VIEW_STYLE_ID;
  style.textContent = getLoginStyles();

  document.head.appendChild(style);
}

export default injectLoginStylesOnce;
