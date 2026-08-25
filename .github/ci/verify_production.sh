#!/usr/bin/env bash
set -euo pipefail

base="${PUBLIC_SITE_URL%/}"
api="${DIRECT_API_URL%/}"
legacy_domain="onionit"".""net"

if [[ "${base}" != "https://onionsupport.com" ]]; then
  echo "::error title=Canonical productivo inválido::PUBLIC_SITE_URL='${base}'; esperado https://onionsupport.com."
  exit 1
fi

legacy_frontend="https://www.${base#https://}"

header_value() {
  local file="$1"
  local header="$2"

  awk -F': *' -v wanted="${header}" '
    tolower($1) == tolower(wanted) {
      sub(/^[^:]+:[[:space:]]*/, "")
      sub(/\r$/, "")
      print
      exit
    }
  ' "${file}"
}

require_header_contains() {
  local file="$1"
  local header="$2"
  local expected="$3"
  local value

  value="$(header_value "${file}" "${header}")"

  if [[ -z "${value}" ]]; then
    echo "::error title=Header ausente::Falta ${header}."
    return 1
  fi

  if [[ "${value,,}" != *"${expected,,}"* ]]; then
    echo "::error title=Header inesperado::${header}='${value}' no contiene '${expected}'."
    return 1
  fi
}

assert_route_headers() {
  local route="$1"
  local mode="$2"
  local headers
  local status
  local xrobots

  headers="$(mktemp)"
  status="$(
    curl \
      --silent \
      --show-error \
      --head \
      --connect-timeout 10 \
      --max-time 30 \
      -H "Cache-Control: no-cache" \
      -o "${headers}" \
      -w "%{http_code}" \
      "${base}${route}?route_check=${VALIDATED_SHA}"
  )"

  if [[ "${status}" != "200" ]]; then
    echo "::error title=Ruta pública inválida::${route} respondió HTTP ${status}; esperado 200."
    cat "${headers}"
    rm -f "${headers}"
    return 1
  fi

  xrobots="$(header_value "${headers}" "x-robots-tag")"
  rm -f "${headers}"

  case "${mode}" in
    index)
      if [[ "${xrobots,,}" != *"index"* || "${xrobots,,}" != *"follow"* || "${xrobots,,}" == *"noindex"* ]]; then
        echo "::error title=Ruta indexable inválida::${route} envía X-Robots-Tag='${xrobots}'."
        return 1
      fi
      ;;
    noindex)
      if [[ "${xrobots,,}" != *"noindex"* || "${xrobots,,}" != *"nofollow"* ]]; then
        echo "::error title=Ruta privada indexable accidentalmente::${route} envía X-Robots-Tag='${xrobots}'."
        return 1
      fi
      ;;
    *)
      echo "::error title=Modo de ruta inválido::${mode}"
      return 1
      ;;
  esac
}

assert_redirect() {
  local route="$1"
  local destination="$2"
  local headers
  local status
  local location

  headers="$(mktemp)"
  status="$(
    curl \
      --silent \
      --show-error \
      --head \
      --connect-timeout 10 \
      --max-time 30 \
      -H "Cache-Control: no-cache" \
      -o "${headers}" \
      -w "%{http_code}" \
      "${base}${route}?alias_check=${VALIDATED_SHA}"
  )"

  location="$(header_value "${headers}" "location")"
  rm -f "${headers}"

  if [[ "${status}" != "301" ]]; then
    echo "::error title=Alias SEO no consolidado::${route} respondió HTTP ${status}; esperado 301."
    return 1
  fi

  case "${location}" in
    "${destination}"|"${base}${destination}")
      ;;
    *)
      echo "::error title=Destino SEO inesperado::${route} location='${location}'; esperado '${destination}'."
      return 1
      ;;
  esac
}

assert_origin_redirect() {
  local source="$1"
  local label="$2"
  local route="$3"
  local query="canonical_probe=${VALIDATED_SHA}&preserve=1"
  local requested="${source}${route}?${query}"
  local expected="${base}${route}?${query}"
  local headers
  local status
  local location

  headers="$(mktemp)"
  status="$(
    curl \
      --silent \
      --show-error \
      --head \
      --connect-timeout 10 \
      --max-time 30 \
      -H "Cache-Control: no-cache" \
      -o "${headers}" \
      -w "%{http_code}" \
      "${requested}"
  )"

  location="$(header_value "${headers}" "location")"
  rm -f "${headers}"

  if [[ "${status}" != "301" ]]; then
    echo "::error title=Canonicalización de origen inválida::${label} ${route} respondió HTTP ${status}; esperado 301."
    return 1
  fi

  if [[ "${location}" != "${expected}" ]]; then
    echo "::error title=Redirección canónica indirecta::${label} ${route} location='${location}'; esperado '${expected}' en un salto conservando path/query."
    return 1
  fi
}

assert_http_www_redirect() {
  local source="$1"
  local label="$2"
  local route="$3"
  local query="canonical_probe=${VALIDATED_SHA}&preserve=1"
  local requested="${source}${route}?${query}"
  local expected="${base}${route}?${query}"
  local legacy_expected="${legacy_frontend}${route}?${query}"
  local headers
  local status
  local location
  local second_headers
  local second_status
  local second_location

  headers="$(mktemp)"
  status="$(
    curl \
      --silent \
      --show-error \
      --head \
      --connect-timeout 10 \
      --max-time 30 \
      -H "Cache-Control: no-cache" \
      -o "${headers}" \
      -w "%{http_code}" \
      "${requested}"
  )"

  location="$(header_value "${headers}" "location")"
  rm -f "${headers}"

  if [[ "${status}" != "301" ]]; then
    echo "::error title=Canonicalización de origen inválida::${label} ${route} respondió HTTP ${status}; esperado 301."
    return 1
  fi

  if [[ "${location}" == "${expected}" ]]; then
    return 0
  fi

  if [[ "${location}" != "${legacy_expected}" ]]; then
    echo "::error title=Primer salto HTTP www inválido::${label} ${route} location='${location}'; esperado '${expected}' directo o '${legacy_expected}' como único salto intermedio conservando path/query."
    return 1
  fi

  second_headers="$(mktemp)"
  second_status="$(
    curl \
      --silent \
      --show-error \
      --head \
      --connect-timeout 10 \
      --max-time 30 \
      -H "Cache-Control: no-cache" \
      -o "${second_headers}" \
      -w "%{http_code}" \
      "${legacy_expected}"
  )"

  second_location="$(header_value "${second_headers}" "location")"
  rm -f "${second_headers}"

  if [[ "${second_status}" != "301" ]]; then
    echo "::error title=Segundo salto HTTP www inválido::${label} ${route} respondió HTTP ${second_status}; esperado 301 hacia '${expected}'."
    return 1
  fi

  if [[ "${second_location}" != "${expected}" ]]; then
    echo "::error title=Cadena HTTP www no consolidada::${label} ${route} segundo location='${second_location}'; esperado '${expected}' sin más saltos y conservando path/query."
    return 1
  fi
}

for route in "/" "/reparacion-ordenadores"; do
  assert_origin_redirect "http://${base#https://}" "HTTP apex" "${route}"
  assert_origin_redirect "${legacy_frontend}" "HTTPS www" "${route}"
  assert_http_www_redirect "http://${legacy_frontend#https://}" "HTTP www" "${route}"
done

root_headers="$(mktemp)"
curl \
  --fail \
  --silent \
  --show-error \
  --head \
  --connect-timeout 10 \
  --max-time 30 \
  -H "Cache-Control: no-cache" \
  "${base}/?headers=${VALIDATED_SHA}" \
  -o "${root_headers}"

require_header_contains "${root_headers}" "strict-transport-security" "max-age="
require_header_contains "${root_headers}" "x-content-type-options" "nosniff"
require_header_contains "${root_headers}" "x-frame-options" "DENY"
require_header_contains "${root_headers}" "referrer-policy" "strict-origin-when-cross-origin"
require_header_contains "${root_headers}" "permissions-policy" "camera=()"
require_header_contains "${root_headers}" "x-robots-tag" "index"
require_header_contains "${root_headers}" "x-robots-tag" "follow"
require_header_contains "${root_headers}" "content-security-policy" "api.onionsupport.com"

csp="$(header_value "${root_headers}" "content-security-policy")"
rm -f "${root_headers}"

if [[ "${csp}" == *"${legacy_domain}"* ]]; then
  echo "::error title=CSP obsoleta::Producción sigue publicando ${legacy_domain}."
  exit 1
fi

indexable_routes=(
  "/"
  "/reparacion-ordenadores"
  "/soporte-informatico"
  "/redes-wifi"
  "/impresoras"
  "/soporte-empresas"
  "/login"
)

for route in "${indexable_routes[@]}"; do
  assert_route_headers "${route}" index
done

while IFS='|' read -r alias destination; do
  [[ -n "${alias}" ]] || continue
  assert_redirect "${alias}" "${destination}"
done <<'EOF'
/seo/reparacion-ordenadores|/reparacion-ordenadores
/seo/reparacion-ordenadores.html|/reparacion-ordenadores
/seo/soporte-informatico|/soporte-informatico
/seo/soporte-informatico.html|/soporte-informatico
/seo/redes-wifi|/redes-wifi
/seo/redes-wifi.html|/redes-wifi
/seo/impresoras|/impresoras
/seo/impresoras.html|/impresoras
/seo/soporte-empresas|/soporte-empresas
/seo/soporte-empresas.html|/soporte-empresas
EOF

noindex_routes=(
  "/password-request"
  "/password-reset"
  "/reset-password"
  "/activate-account"
  "/dashboard"
  "/@ci-probe"
  "/incidencias"
  "/facturas"
  "/clientes"
  "/usuarios"
  "/correo"
  "/servidor"
  "/cuenta"
  "/ajustes"
)

for route in "${noindex_routes[@]}"; do
  assert_route_headers "${route}" noindex
done

health_headers="$(mktemp)"
health_body="$(mktemp)"
health_status="$(
  curl \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    -H "Origin: ${PUBLIC_SITE_URL}" \
    -D "${health_headers}" \
    -o "${health_body}" \
    -w "%{http_code}" \
    "${api}/health"
)"

if [[ "${health_status}" != "200" ]]; then
  echo "::error title=Backend no saludable::${api}/health respondió HTTP ${health_status}."
  cat "${health_body}"
  rm -f "${health_headers}" "${health_body}"
  exit 1
fi

python3 - "${health_body}" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

if data.get("ok") is not True:
    raise SystemExit("health.ok no es true")
if data.get("code") != "HEALTH_OK":
    raise SystemExit(f"health.code inesperado: {data.get('code')!r}")
if data.get("service") != "onion-backend":
    raise SystemExit(f"health.service inesperado: {data.get('service')!r}")
PY

require_header_contains "${health_headers}" "access-control-allow-origin" "${PUBLIC_SITE_URL}"
require_header_contains "${health_headers}" "access-control-allow-credentials" "true"
rm -f "${health_headers}" "${health_body}"

cors_headers="$(mktemp)"
cors_status="$(
  curl \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    -X OPTIONS \
    -H "Origin: ${PUBLIC_SITE_URL}" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,content-type" \
    -D "${cors_headers}" \
    -o /dev/null \
    -w "%{http_code}" \
    "${api}/api/auth/me"
)"

if [[ "${cors_status}" != "204" ]]; then
  echo "::error title=CORS preflight permitido inválido::Origen ${PUBLIC_SITE_URL} respondió HTTP ${cors_status}; esperado 204."
  cat "${cors_headers}"
  rm -f "${cors_headers}"
  exit 1
fi

cors_origin="$(header_value "${cors_headers}" "access-control-allow-origin")"
cors_credentials="$(header_value "${cors_headers}" "access-control-allow-credentials")"

if [[ "${cors_origin}" != "${PUBLIC_SITE_URL}" ]]; then
  echo "::error title=CORS origin inesperado::access-control-allow-origin='${cors_origin}'; esperado '${PUBLIC_SITE_URL}'."
  rm -f "${cors_headers}"
  exit 1
fi

if [[ "${cors_credentials,,}" != "true" ]]; then
  echo "::error title=CORS credentials inesperado::access-control-allow-credentials='${cors_credentials}'; esperado true."
  rm -f "${cors_headers}"
  exit 1
fi

require_header_contains "${cors_headers}" "access-control-allow-methods" "GET"
require_header_contains "${cors_headers}" "access-control-allow-headers" "Authorization"
require_header_contains "${cors_headers}" "access-control-allow-headers" "Content-Type"
require_header_contains "${cors_headers}" "vary" "Origin"
require_header_contains "${cors_headers}" "vary" "Access-Control-Request-Method"
require_header_contains "${cors_headers}" "vary" "Access-Control-Request-Headers"
rm -f "${cors_headers}"
echo "CORS permitido: preflight canónico verificado."

hostile_origin="https://evil.example"
hostile_headers="$(mktemp)"
hostile_status="$(
  curl \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    -X OPTIONS \
    -H "Origin: ${hostile_origin}" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,content-type" \
    -D "${hostile_headers}" \
    -o /dev/null \
    -w "%{http_code}" \
    "${api}/api/auth/me"
)"

if [[ "${hostile_status}" != "403" ]]; then
  echo "::error title=CORS origen hostil no bloqueado::${hostile_origin} respondió HTTP ${hostile_status}; esperado 403."
  cat "${hostile_headers}"
  rm -f "${hostile_headers}"
  exit 1
fi

if [[ -n "$(header_value "${hostile_headers}" "access-control-allow-origin")" ]]; then
  echo "::error title=CORS filtró autorización a origen hostil::Se devolvió access-control-allow-origin."
  rm -f "${hostile_headers}"
  exit 1
fi

if [[ -n "$(header_value "${hostile_headers}" "access-control-allow-credentials")" ]]; then
  echo "::error title=CORS filtró credenciales a origen hostil::Se devolvió access-control-allow-credentials."
  rm -f "${hostile_headers}"
  exit 1
fi
rm -f "${hostile_headers}"
echo "CORS hostil: origen rechazado sin autorización del navegador."

verify_auth_guard() {
  local url="$1"
  local label="$2"
  local headers
  local body
  local status
  local scope
  local gateway

  headers="$(mktemp)"
  body="$(mktemp)"
  status="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 10 \
      --max-time 30 \
      -D "${headers}" \
      -o "${body}" \
      -w "%{http_code}" \
      "${url}/api/auth/me"
  )"

  if [[ "${status}" != "401" ]]; then
    echo "::error title=Auth guard inesperado::${label} respondió HTTP ${status}; esperado 401."
    cat "${body}"
    rm -f "${headers}" "${body}"
    return 1
  fi

  python3 - "${body}" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)
if data.get("ok") is not False:
    raise SystemExit("auth.ok debe ser false sin credenciales")
if data.get("authenticated") is not False:
    raise SystemExit("authenticated debe ser false sin credenciales")
if data.get("code") != "MISSING_TOKEN":
    raise SystemExit(f"code inesperado: {data.get('code')!r}")
PY

  scope="$(header_value "${headers}" "x-onion-scope")"
  gateway="$(header_value "${headers}" "x-onion-gateway")"
  if [[ "${scope}" != "onion-api-gateway" ]]; then
    echo "::error title=Backend incorrecto::${label} x-onion-scope='${scope}'."
    rm -f "${headers}" "${body}"
    return 1
  fi
  if [[ -z "${gateway}" ]]; then
    echo "::error title=Gateway sin identidad::${label} no devuelve x-onion-gateway."
    rm -f "${headers}" "${body}"
    return 1
  fi
  require_header_contains "${headers}" "www-authenticate" "Bearer"
  rm -f "${headers}" "${body}"
  echo "${label}: auth guard conectado al Onion API Gateway."
}

verify_auth_guard "${api}" "Direct API"
echo "Producción verificada de extremo a extremo: frontend, superficie SEO pública, aliases canónicos, headers, rutas, CORS y API directa."
