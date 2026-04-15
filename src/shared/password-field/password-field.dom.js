/* =========================================================
   Onion SPA - Shared Password Field DOM
   Archivo: src/shared/password-field/password-field.dom.js

   Responsabilidades:
   - bindear todos los campos password reutilizables
   - controlar show/hide password
   - controlar indicador de CapsLock
   - evitar listeners duplicados
   - soportar múltiples campos dentro de una misma vista
========================================================= */

import {
  getEyeIcon,
  getEyeOffIcon,
} from "./password-field.template.js";

function isFunction(value) {
  return typeof value === "function";
}

function setPressedState(toggle, pressed) {
  if (!(toggle instanceof HTMLElement)) {
    return;
  }

  toggle.setAttribute("aria-pressed", pressed ? "true" : "false");

  const showLabel =
    String(toggle.dataset.showLabel || "Mostrar contraseña").trim() ||
    "Mostrar contraseña";

  const hideLabel =
    String(toggle.dataset.hideLabel || "Ocultar contraseña").trim() ||
    "Ocultar contraseña";

  toggle.setAttribute("aria-label", pressed ? hideLabel : showLabel);
  toggle.innerHTML = pressed ? getEyeOffIcon() : getEyeIcon();
}

function setCapsState(indicator, active) {
  if (!(indicator instanceof HTMLElement)) {
    return;
  }

  indicator.hidden = !active;
  indicator.classList.toggle("is-visible", Boolean(active));
}

function readCapsStateFromEvent(event) {
  if (!event || !isFunction(event.getModifierState)) {
    return false;
  }

  return Boolean(event.getModifierState("CapsLock"));
}

function shouldShowCapsForInput(input) {
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }

  return document.activeElement === input;
}

export function bindPasswordField(fieldRoot) {
  if (!(fieldRoot instanceof HTMLElement)) {
    return null;
  }

  if (fieldRoot.dataset.passwordFieldBound === "true") {
    return fieldRoot;
  }

  const input = fieldRoot.querySelector('[data-password-input="true"]');
  const toggle = fieldRoot.querySelector('[data-password-toggle="true"]');
  const capsIndicator = fieldRoot.querySelector('[data-password-caps="true"]');

  if (!(input instanceof HTMLInputElement) || !(toggle instanceof HTMLButtonElement)) {
    return null;
  }

  fieldRoot.dataset.passwordFieldBound = "true";

  const syncVisibilityUI = () => {
    const visible = input.type === "text";
    setPressedState(toggle, visible);
  };

  const syncCapsFromEvent = (event) => {
    if (!capsIndicator) {
      return;
    }

    const active = shouldShowCapsForInput(input) && readCapsStateFromEvent(event);
    setCapsState(capsIndicator, active);
  };

  const hideCaps = () => {
    if (!capsIndicator) {
      return;
    }

    setCapsState(capsIndicator, false);
  };

  toggle.addEventListener("click", () => {
    const nextType = input.type === "password" ? "text" : "password";
    input.type = nextType;
    syncVisibilityUI();
    input.focus({ preventScroll: true });
  });

  input.addEventListener("keydown", syncCapsFromEvent);
  input.addEventListener("keyup", syncCapsFromEvent);
  input.addEventListener("focus", syncCapsFromEvent);
  input.addEventListener("blur", hideCaps);

  syncVisibilityUI();
  hideCaps();

  return {
    root: fieldRoot,
    input,
    toggle,
    capsIndicator,
    syncVisibilityUI,
    hideCaps,
  };
}

export function bindPasswordFieldsInScope(scope = document) {
  if (!(scope instanceof Element) && scope !== document) {
    return [];
  }

  const fields = Array.from(
    scope.querySelectorAll('[data-password-field="true"]')
  );

  return fields
    .map(bindPasswordField)
    .filter(Boolean);
}

export default bindPasswordFieldsInScope;
