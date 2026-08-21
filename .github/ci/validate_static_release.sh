#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "index.html"
  "staticwebapp.config.json"
  "site.webmanifest"
  "robots.txt"
  "sitemap.xml"
  "favicon.ico"
  "ad1f6102f1914986b540f6a34bf6939b.txt"

  ".github/scripts/repo_integrity.py"

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

python3 -m json.tool staticwebapp.config.json >/dev/null
python3 -m json.tool site.webmanifest >/dev/null
python3 -m py_compile .github/scripts/repo_integrity.py

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

forbidden_public_refs=(
  "/src/media/img/favicon_black_circle.png"
  "/src/media/img/favicon_white.png"
  "/src/media/img/favicon_black.png"
  "?v="
)

for ref in "${forbidden_public_refs[@]}"; do
  if grep -Fq "${ref}" index.html site.webmanifest robots.txt 2>/dev/null; then
    echo "::error title=Referencia pública obsoleta::No debe aparecer '${ref}' en archivos públicos."
    exit 1
  fi
done

python3 - <<'PY'
from pathlib import Path
import sys

bad_paths = []

for root_name in ("src", ".github"):
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

python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re
import sys

root = Path(".").resolve()
errors = []

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

class IndexParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs or [])

        if tag in {"script", "img", "source", "video", "audio"}:
            check("index.html", attrs.get("src", ""))

        if tag == "link":
            check("index.html", attrs.get("href", ""))

IndexParser().feed(Path("index.html").read_text(encoding="utf-8"))

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
