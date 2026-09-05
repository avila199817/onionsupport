/* =========================================================
   Onion Support - Home Onboarding API
   Archivo: /src/views/home/home.onboarding.js

   ONBOARDING V1 · API OWNER · SIN DOM / ROUTER / STORAGE
========================================================= */

import Http from "../../core/http.js";

export const HOME_ONBOARDING_VERSION = "home.onboarding.v1.persisted-step-state";
export const HOME_ONBOARDING_ENDPOINT = "/api/users/me/onboarding";
export const HOME_ONBOARDING_GUIDE_VERSION = 1;
export const HOME_ONBOARDING_STEP = 1;

export const HOME_ONBOARDING_ACTIONS = Object.freeze({
  OPEN_INCIDENCIAS: "open_incidencias",
  DISMISS: "dismiss",
});

const ALLOWED_ACTIONS = new Set(Object.values(HOME_ONBOARDING_ACTIONS));
const REQUEST_TIMEOUT_MS = 10_000;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function responseFailed(response = null) {
  return Boolean(
    isObject(response) &&
    (response.ok === false || response.success === false)
  );
}

function responseMessage(response = null, fallback = "No se pudo guardar la guía.") {
  if (!isObject(response)) return fallback;
  return text(
    response.message || response.error || response.code || fallback,
    fallback
  );
}

export function normalizeHomeOnboarding(value = null) {
  const source = isObject(value) ? value : {};
  const assignedVersion = integer(source.assignedVersion, 0);
  const completedVersion = Math.min(
    assignedVersion,
    integer(source.completedVersion, 0)
  );
  const completedStep = integer(source.completedStep, 0);
  const required = source.required === true || assignedVersion > completedVersion;
  const nextStep = required
    ? integer(source.nextStep, completedStep + 1)
    : null;

  return Object.freeze({
    schemaVersion: Math.max(1, integer(source.schemaVersion, 1)),
    assignedVersion,
    completedVersion,
    completedStep,
    completedAt: text(source.completedAt, "") || null,
    outcome: text(source.outcome, "") || null,
    startedAt: text(source.startedAt, "") || null,
    firstInteractionAt: text(source.firstInteractionAt, "") || null,
    updatedAt: text(source.updatedAt, "") || null,
    lastInteraction: isObject(source.lastInteraction)
      ? Object.freeze({ ...source.lastInteraction })
      : null,
    required,
    nextStep,
    availableSteps: Math.max(1, integer(source.availableSteps, 1)),
    autoPrompt: source.autoPrompt === true,
  });
}

export async function loadHomeOnboarding(options = {}) {
  const response = await Http.get(HOME_ONBOARDING_ENDPOINT, {
    timeout: options.timeout || REQUEST_TIMEOUT_MS,
    signal: options.signal,
    source: "views.home.onboarding.read",
  });

  if (responseFailed(response)) {
    throw new Error(responseMessage(response, "No se pudo consultar la guía."));
  }

  return normalizeHomeOnboarding(response?.onboarding);
}

export async function saveHomeOnboardingChoice({
  version = HOME_ONBOARDING_GUIDE_VERSION,
  step = HOME_ONBOARDING_STEP,
  action = "",
  signal,
  timeout = REQUEST_TIMEOUT_MS,
} = {}) {
  const cleanAction = text(action, "").toLowerCase();
  const cleanVersion = integer(version, 0);
  const cleanStep = integer(step, 0);

  if (
    cleanVersion !== HOME_ONBOARDING_GUIDE_VERSION ||
    cleanStep !== HOME_ONBOARDING_STEP ||
    !ALLOWED_ACTIONS.has(cleanAction)
  ) {
    const error = new Error("Elección de onboarding no válida.");
    error.code = "HOME_ONBOARDING_CHOICE_INVALID";
    throw error;
  }

  const response = await Http.put(
    HOME_ONBOARDING_ENDPOINT,
    {
      version: cleanVersion,
      step: cleanStep,
      action: cleanAction,
    },
    {
      timeout,
      signal,
      source: "views.home.onboarding.choice",
    }
  );

  if (responseFailed(response)) {
    const error = new Error(responseMessage(response));
    error.code = text(response?.code, "HOME_ONBOARDING_SAVE_FAILED");
    throw error;
  }

  return normalizeHomeOnboarding(response?.onboarding);
}

export function getHomeOnboardingSnapshot() {
  return Object.freeze({
    version: HOME_ONBOARDING_VERSION,
    endpoint: HOME_ONBOARDING_ENDPOINT,
    guideVersion: HOME_ONBOARDING_GUIDE_VERSION,
    availableStep: HOME_ONBOARDING_STEP,
    actions: Object.freeze({ ...HOME_ONBOARDING_ACTIONS }),
    policy: Object.freeze({
      serverAuthoritative: true,
      noDom: true,
      noRouter: true,
      noStorage: true,
      noFetch: true,
      boundedChoicePayload: true,
    }),
  });
}
