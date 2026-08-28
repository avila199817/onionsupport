#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DEPLOYED_URL:-}" ]]; then
  echo "::error title=Azure no devolvió URL::DEPLOYED_URL está vacío."
  exit 1
fi

if [[ -z "${VALIDATED_SHA:-}" ]]; then
  echo "::error title=SHA validado ausente::VALIDATED_SHA está vacío."
  exit 1
fi

VERIFY_CANONICAL="${VERIFY_CANONICAL:-false}"

if [[ "${VERIFY_CANONICAL}" != "true" && "${VERIFY_CANONICAL}" != "false" ]]; then
  echo "::error title=Modo de verificación inválido::VERIFY_CANONICAL debe ser true o false."
  exit 1
fi

normalize_base() {
  local base="${1%/}"

  if [[ -z "${base}" ]]; then
    echo "::error title=URL de deploy vacía::No se recibió hostname."
    return 1
  fi

  if [[ "${base}" != http://* && "${base}" != https://* ]]; then
    base="https://${base}"
  fi

  if [[ ! "${base}" =~ ^https:// ]]; then
    echo "::error title=URL de deploy inválida::Se recibió '${base}'."
    return 1
  fi

  printf '%s' "${base}"
}

wait_for_release() {
  local raw_base="$1"
  local label="$2"
  local base
  local attempt
  local entry
  local path
  local remote_path
  local local_sha
  local remote_sha
  local body
  local mismatch
  local status

  local checks=(
    "index.html|/"
    "robots.txt|/robots.txt"
    "sitemap.xml|/sitemap.xml"
    "src/main.js|/src/main.js"
    "src/app/index.js|/src/app/index.js"
    "src/core/config.js|/src/core/config.js"
    "src/core/http.js|/src/core/http.js"
    "src/features/auth/index.js|/src/features/auth/index.js"
    "src/router/index.js|/src/router/index.js"
    "src/router/routes.js|/src/router/routes.js"
    "src/preboot/public-home-preload.js|/src/preboot/public-home-preload.js"
    "src/views/public/index.js|/src/views/public/index.js"
    "src/views/public/home/template.js|/src/views/public/home/template.js"
    "src/views/public/login/template.js|/src/views/public/login/template.js"
    "src/media/img/favicon_black_circle_128.webp|/src/media/img/favicon_black_circle_128.webp"
    "src/media/img/Cristian_Avila_224.webp|/src/media/img/Cristian_Avila_224.webp"
    "src/media/img/Cristian_Avila_480.webp|/src/media/img/Cristian_Avila_480.webp"
    "src/media/img/Cristian_Avila_640.webp|/src/media/img/Cristian_Avila_640.webp"
    "src/media/img/Cristian_Avila_960.webp|/src/media/img/Cristian_Avila_960.webp"
  )

  local denied_paths=(
    "/tools"
    "/tools/validate-dist.mjs"
    "/dist/index.html"
    "/build-metadata/release.json"
    "/package.json"
    "/package-lock.json"
    "/vite.config.js"
    "/.node-version"
    "/.nvmrc"
    "/.gitignore"
  )

  base="$(normalize_base "${raw_base}")"

  echo "Verificando bytes exactos en ${label}: ${base}"

  for attempt in $(seq 1 36); do
    mismatch=0

    for entry in "${checks[@]}"; do
      path="${entry%%|*}"
      remote_path="${entry#*|}"
      body="$(mktemp)"
      local_sha="$(sha256sum "${path}" | awk '{print $1}')"

      if ! curl \
        --fail \
        --silent \
        --show-error \
        --location \
        --connect-timeout 10 \
        --max-time 30 \
        -H "Cache-Control: no-cache" \
        -H "Pragma: no-cache" \
        "${base}${remote_path}?release=${VALIDATED_SHA}" \
        -o "${body}"; then
        mismatch=1
        rm -f "${body}"
        break
      fi

      remote_sha="$(sha256sum "${body}" | awk '{print $1}')"
      rm -f "${body}"

      if [[ "${remote_sha}" != "${local_sha}" ]]; then
        mismatch=1
        break
      fi
    done

    if [[ "${mismatch}" == "0" ]]; then
      for path in "${denied_paths[@]}"; do
        status="$(curl \
          --silent \
          --show-error \
          --connect-timeout 10 \
          --max-time 30 \
          -H "Cache-Control: no-cache" \
          -H "Pragma: no-cache" \
          -o /dev/null \
          -w '%{http_code}' \
          "${base}${path}?release=${VALIDATED_SHA}" || true)"

        if [[ "${status}" != "404" ]]; then
          mismatch=1
          break
        fi
      done
    fi

    if [[ "${mismatch}" == "0" ]]; then
      echo "${label}: release ${VALIDATED_SHA} visible, byte-exacto y tooling de build privado."
      return 0
    fi

    if [[ "${attempt}" -lt 36 ]]; then
      echo "${label}: propagación pendiente (${attempt}/36); reintento en 5s..."
      sleep 5
    fi
  done

  echo "::error title=Release no propagado::${label} no sirve los bytes exactos de ${VALIDATED_SHA} tras 180s."
  return 1
}

wait_for_release "${DEPLOYED_URL}" "Azure deployment environment"

if [[ "${VERIFY_CANONICAL}" == "true" ]]; then
  if [[ -z "${PUBLIC_SITE_URL:-}" ]]; then
    echo "::error title=Dominio canónico ausente::PUBLIC_SITE_URL está vacío."
    exit 1
  fi

  wait_for_release "${PUBLIC_SITE_URL}" "Canonical production domain"
fi
