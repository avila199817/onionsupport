#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "index.html"
  "login.html"
  "staticwebapp.config.json"
  "site.webmanifest"
  "robots.txt"
  "sitemap.xml"
  "favicon.ico"
  "ad1f6102f1914986b540f6a34bf6939b.txt"
  ".github/ci/canonical-apex-v1"
  ".github/ci/seo-public-surface-v2"
  ".github/scripts/repo_integrity.py"
  "seo/reparacion-ordenadores.html"
  "seo/soporte-informatico.html"
  "seo/redes-wifi.html"
  "seo/impresoras.html"
  "seo/soporte-empresas.html"
  "src/css/seo/public-service.css"
  "src/main.js"
  "src/app/index.js"
  "src/app/loader.js"
  "src/core/config.js"
  "src/core/http.js"
  "src/core/index.js"
  "src/core/media.js"
  "src/features/auth/index.js"
  "src/router/index.js"
  "src/router/routes.js"
  "src/preboot/theme.js"
  "src/css/app.css"
  "src/css/core/noscript.css"
  "src/css/auth/login.css"
  "src/views/public/index.js"
  "src/views/public/login/index.js"
  "src/views/public/login/template.js"
  "src/views/public/password-reset/index.js"
  "src/views/public/password-reset/template.js"
  "src/ui/toast/index.js"
  "src/ui/sidebar/index.js"
  "src/ui/sidebar/template.js"
  "src/ui/topbar/index.js"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "::error file=${file},title=Archivo obligatorio ausente::No existe ${file}."
    exit 1
  fi
done

if [[ "$(cat .github/ci/seo-public-surface-v2)" != "seo-public-surface-v2" ]]; then
  echo "::error file=.github/ci/seo-public-surface-v2,title=Marcador SEO inválido::Contenido inesperado."
  exit 1
fi

if [[ "$(cat .github/ci/canonical-apex-v1)" != "canonical-apex-v1" ]]; then
  echo "::error file=.github/ci/canonical-apex-v1,title=Marcador canonical inválido::Contenido inesperado."
  exit 1
fi

for forbidden_origin in \
  "www"".""onionsupport.com" \
  "http://onionsupport"".""com" \
  "http%3A%2F%2Fonionsupport"".""com"; do
  if git grep -n -I -i -F "${forbidden_origin}" -- .; then
    echo "::error title=Origen público no canónico::Se detectó '${forbidden_origin}'."
    exit 1
  fi
done

forbidden_files=(
  "BingSiteAuth.xml"
  "manifest.json"
  "sw.js"
  "apple-touch-icon.png"
)

for file in "${forbidden_files[@]}"; do
  if [[ -e "${file}" ]]; then
    echo "::error file=${file},title=Archivo obsoleto restaurado::${file} debe permanecer eliminado."
    exit 1
  fi
done

python3 -I -m json.tool staticwebapp.config.json >/dev/null
python3 -I -m json.tool site.webmanifest >/dev/null

python3 -I - <<'PY'
from pathlib import Path
import json
import sys

config = json.loads(Path("staticwebapp.config.json").read_text(encoding="utf-8"))
routes = {
    item.get("route"): item
    for item in config.get("routes", [])
    if isinstance(item, dict) and isinstance(item.get("route"), str)
}
required_bootstrap_denials = (
    "/tools",
    "/tools/*",
    "/dist",
    "/dist/*",
    "/build-metadata",
    "/build-metadata/*",
    "/package.json",
    "/package-lock.json",
    "/vite.config.js",
    "/.node-version",
    "/.nvmrc",
    "/.gitignore",
)

missing = [
    route
    for route in required_bootstrap_denials
    if routes.get(route, {}).get("statusCode") != 404
]
if missing:
    for route in missing:
        print(
            f"::error file=staticwebapp.config.json,title=Ruta de build pública::"
            f"{route} debe responder 404 durante el deploy legacy."
        )
    sys.exit(1)

print(f"Bootstrap build paths denied · routes={len(required_bootstrap_denials)}")
PY

python3 -I - <<'PY'
from pathlib import Path
import ast

path = Path(".github/scripts/repo_integrity.py")
ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
PY

required_index_refs=(
  "/favicon.ico"
  "/site.webmanifest"
  "/src/preboot/theme.js"
  "/src/css/app.css"
  "/src/css/core/noscript.css"
  "/src/main.js"
)

for ref in "${required_index_refs[@]}"; do
  if ! grep -Fq "${ref}" index.html; then
    echo "::error file=index.html,title=Referencia obligatoria ausente::Falta ${ref}."
    exit 1
  fi
done

for ref in "/src/main.js" "/src/css/app.css" "/src/preboot/theme.js"; do
  if ! grep -Fq "${ref}" login.html; then
    echo "::error file=login.html,title=Shell login incompleto::Falta ${ref}."
    exit 1
  fi
done

forbidden_public_refs=(
  "/src/media/img/favicon_black_circle.png"
  "/src/media/img/favicon_white.png"
  "/src/media/img/favicon_black.png"
  "?v="
)

for ref in "${forbidden_public_refs[@]}"; do
  if grep -Fq "${ref}" \
    index.html login.html seo/*.html site.webmanifest robots.txt 2>/dev/null; then
    echo "::error title=Referencia pública obsoleta::No debe aparecer '${ref}' en archivos públicos."
    exit 1
  fi
done

python3 -I - <<'PY'
from pathlib import Path
import sys

bad_paths = []
for root_name in ("src", ".github", "seo"):
    root = Path(root_name)
    if not root.exists():
        continue
    for path in root.rglob("*"):
        if any(part != part.strip() for part in path.parts):
            bad_paths.append(str(path))

if bad_paths:
    for path in bad_paths:
        print(
            f"::error file={path},title=Ruta inválida::"
            "Hay espacios al principio o final de un componente del path."
        )
    sys.exit(1)

print("Paths del release OK.")
PY

python3 -I - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import sys

root = Path(".").resolve()
errors = []
public_html = (
    Path("index.html"),
    Path("login.html"),
    Path("seo/reparacion-ordenadores.html"),
    Path("seo/soporte-informatico.html"),
    Path("seo/redes-wifi.html"),
    Path("seo/impresoras.html"),
    Path("seo/soporte-empresas.html"),
)

def is_external(ref):
    ref = (ref or "").strip()
    if not ref or ref.startswith("#") or ref.startswith("//"):
        return True
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", ref))

def resolve_ref(ref):
    ref = (ref or "").strip()
    if is_external(ref):
        return None
    path = urlsplit(ref).path or ""
    if not path or path == "/":
        return None
    if path.startswith("/"):
        return root / path.lstrip("/")
    return root / path

def check(owner, ref):
    path = resolve_ref(ref)
    if path is not None and not path.exists():
        errors.append(f"{owner}: referencia local inexistente {ref}")

class PublicParser(HTMLParser):
    def __init__(self, owner):
        super().__init__()
        self.owner = owner

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs or [])
        if tag in {"script", "img", "source", "video", "audio"}:
            check(self.owner, attrs.get("src", ""))
        if tag == "link":
            check(self.owner, attrs.get("href", ""))

for path in public_html:
    PublicParser(str(path)).feed(path.read_text(encoding="utf-8"))

manifest = json.loads(Path("site.webmanifest").read_text(encoding="utf-8"))
for icon in manifest.get("icons", []):
    if isinstance(icon, dict):
        check("site.webmanifest", icon.get("src", ""))

if errors:
    for item in errors:
        print(f"::error title=Referencia pública local inválida::{item}")
    sys.exit(1)

print("Referencias públicas locales OK.")
PY
