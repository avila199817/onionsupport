#!/usr/bin/env python3
"""Static footer migration fixtures; no candidate JavaScript is executed."""
from contextlib import redirect_stdout
import importlib.util
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("trusted_public_footer_policy", Path(__file__).with_name("public_home_integrity.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

HOME = "src/views/public/home/template.js"
SHELL = "src/views/public/index.js"
EXTREME = "src/features/public-support-extreme/index.js"
STYLES = "src/router/styles.js"
COPY = "Usaremos el correo y el móvil que indiques. Si ya tienes cuenta, la reutilizamos sin cambiar tus datos; si es tu primera vez, recibirás un acceso seguro."


def fixture_files():
    identity = policy.LEGAL_IDENTITY
    contact = '<a href="mailto:${PUBLIC_LEGAL.email}">${PUBLIC_LEGAL.email}</a>'
    details = "".join(f'<details id="{identifier}"><summary>{identifier}</summary><p>Información disponible</p></details>' for identifier in policy.LEGAL_IDS)
    footer_template = ('<footer class="public-legal-footer ${escape(className)}"><p>' +
        " · ".join('${PUBLIC_LEGAL.' + key + '}' for key in ("name", "owner", "taxId", "address", "phone")) +
        '</p>${supportLink()}<a href="tel:${PUBLIC_LEGAL.phoneHref}">${PUBLIC_LEGAL.phone}</a>' +
        details + '<button type="button" data-public-cookie-settings>Configurar cookies</button></footer>')
    footer_html = footer_template.replace('${escape(className)}', '').replace('${supportLink()}', contact)
    for key, value in identity.items():
        footer_html = footer_html.replace('${PUBLIC_LEGAL.' + key + '}', value)
    properties = ",\n".join(f'{key}: {json.dumps(value, ensure_ascii=False)}' for key, value in identity.items())
    legal = ('export const PUBLIC_LEGAL = Object.freeze({' + properties + '});\n' +
        'const supportLink = () => `' + contact + '`;\n' +
        'export function renderPublicLegalFooter({className = ""} = {}) { return `' + footer_template + '`; }')
    home = '''import { renderPublicLegalFooter } from "../../../core/public-legal.js";
const BUSINESS = Object.freeze({loginPath: "/login"});
function renderHeader() {
 const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");
 return `<header><a href="${escapeAttr(loginHref)}" data-public-home-login="true">Iniciar sesión</a></header>`;
}
export function createPublicHomeTemplate() {
 return renderPublicShell({footer: false, body: `<div>${renderHeader()}${renderPublicLegalFooter()}</div>`});
}'''
    shell = '''import { renderPublicLegalFooter } from "../../core/public-legal.js";
export function renderPublicShell({footer = true, body = ""} = {}) {
 return `<section>${body}${footer ? renderPublicLegalFooter() : ""}</section>`;
}'''
    css = '@layer auth { .public-legal-footer { color: #fff; } .public-legal-footer__content { max-width: 88ch; } }'
    manifest = "const STYLE_MANIFEST = Object.freeze({" + ",".join(json.dumps(route) + ': Object.freeze(["' + policy.LEGAL_CSS + '"])' for route in ("public-home", "login", "password-request", "password-reset", "activate-account")) + "});"
    extreme = 'function ensureAuthorityNotice(form) { const description = document.createElement("p"); description.textContent = ' + json.dumps(COPY, ensure_ascii=False) + '; copy.append(title, description); notice.append(icon, copy); head.insertAdjacentElement("afterend", notice); }'
    files = {policy.LEGAL_MODULE: legal, HOME: home, SHELL: shell, STYLES: manifest, EXTREME: extreme, policy.LEGAL_CSS.lstrip("/"): css}
    for page in policy.SEO_PAGES:
        files[page] = '<html><head><link rel="stylesheet" href="' + policy.LEGAL_CSS + '"></head><body><header><a class="seo-nav-access" href="/login">Iniciar sesión</a></header>' + footer_html + '</body></html>'
    return files


class PublicFooterPolicy(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="onion-footer-policy-")
        self.root = Path(self.temp.name)
        self.files = fixture_files()
        self.restore()
        self.core = SimpleNamespace(ROOT=self.root)

    def tearDown(self):
        self.temp.cleanup()

    def restore(self):
        for relative, source in self.files.items():
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source, encoding="utf-8")

    def mutate(self, path, old, new):
        target = self.root / path
        source = target.read_text(encoding="utf-8")
        self.assertIn(old, source)
        target.write_text(source.replace(old, new), encoding="utf-8")

    def errors(self):
        return policy.footer_policy_errors(self.core)

    def test_modern_source_fixture_is_accepted(self):
        self.assertEqual(self.errors(), [])

    def test_legacy_absence_preserves_original_core_rules(self):
        (self.root / policy.LEGAL_MODULE).unlink()
        self.assertEqual(self.errors(), [])
        self.assertEqual(self.run_main([]), 0, "valid legacy core remains accepted")
        for message in policy.MODERN_REPLACED_MESSAGES:
            with self.subTest(message=message):
                self.assertEqual(self.run_main([message]), 1, "legacy errors must not be suppressed without the new module")

    def run_main(self, failures):
        core = SimpleNamespace(ROOT=self.root)
        core.require = lambda errors, condition, message: errors.append(message) if not condition else None
        def main():
            errors = []
            for message in failures:
                core.require(errors, False, message)
            return int(bool(errors))
        core.main = main
        with patch.object(policy, "load_core", return_value=core), patch.object(policy, "photo_policy_errors", return_value=[]), redirect_stdout(StringIO()):
            return policy.main()

    def test_modern_replaces_only_nine_exact_messages(self):
        self.assertEqual(len(policy.MODERN_REPLACED_MESSAGES), 9)
        self.assertEqual(self.run_main(list(policy.MODERN_REPLACED_MESSAGES)), 0)
        for message in ["Falta POST /api/tickets/public", "Falta auth opcional", "Falta lock local por teléfono", "El footer debe ocultar login/cuenta EXTRA", "La UI debe explicar la reutilización por correo O teléfono EXTRA"]:
            with self.subTest(message=message):
                self.assertEqual(self.run_main([message]), 1, "unrelated and prefix/suffix errors remain blocking")

    def test_module_presence_is_atomic_even_when_empty(self):
        (self.root / policy.LEGAL_MODULE).write_text("/* modern marker only */", encoding="utf-8")
        self.assertTrue(self.errors())
        self.assertEqual(self.run_main(list(policy.MODERN_REPLACED_MESSAGES)), 1)

    def test_rejected_mutations(self):
        first = policy.SEO_PAGES[0]
        css = policy.LEGAL_CSS.lstrip("/")
        cases = [
            ("missing Home footer", HOME, '${renderPublicLegalFooter()}', ''),
            ("duplicate Home footer", HOME, '${renderPublicLegalFooter()}', '${renderPublicLegalFooter()}${renderPublicLegalFooter()}'),
            ("duplicate Home header", HOME, '${renderHeader()}', '${renderHeader()}${renderHeader()}'),
            ("commented Home call", HOME, '${renderPublicLegalFooter()}', '<!-- ${renderPublicLegalFooter()} -->'),
            ("string pretending to call", HOME, '${renderPublicLegalFooter()}', '${"${renderPublicLegalFooter()}"}'),
            ("hidden Home footer", HOME, '${renderPublicLegalFooter()}', '<div hidden>${renderPublicLegalFooter()}</div>'),
            ("commented Home import", HOME, 'import { renderPublicLegalFooter } from "../../../core/public-legal.js";', '/* import { renderPublicLegalFooter } from "../../../core/public-legal.js"; */'),
            ("string pretending to import", HOME, 'import { renderPublicLegalFooter } from "../../../core/public-legal.js";', "'import { renderPublicLegalFooter } from \"../../../core/public-legal.js\";';"),
            ("shell still adds second footer", HOME, 'footer: false', 'footer: true'),
            ("overwritten Home option", HOME, 'footer: false', 'footer: false, footer: true'),
            ("missing shell renderer", SHELL, '${footer ? renderPublicLegalFooter() : ""}', ''),
            ("hidden shell renderer", SHELL, '${footer ? renderPublicLegalFooter() : ""}', '<template>${footer ? renderPublicLegalFooter() : ""}</template>'),
            ("dead legal return", policy.LEGAL_MODULE, 'return `<footer', 'return ""; return `<footer'),
            ("dead Home return", HOME, 'return renderPublicShell', 'return ""; return renderPublicShell'),
            ("dead header return", HOME, 'return `<header', 'return ""; return `<header'),
            ("wrong identity source", policy.LEGAL_MODULE, '20568568J', '00000000X'),
            ("comment-only identity", policy.LEGAL_MODULE, 'taxId: "20568568J"', 'taxId: "00000000X" /* taxId: "20568568J" */'),
            ("source privacy ID missing", policy.LEGAL_MODULE, 'id="public-privacy"', 'id="other-privacy"'),
            ("arbitrary footer interpolation", policy.LEGAL_MODULE, '${supportLink()}', '${fetch("https://example.test")}'),
            ("SEO footer missing", first, '<footer class="public-legal-footer ">', '<section class="public-legal-footer ">'),
            ("SEO footer duplicated", first, '</footer>', '</footer><footer class="public-legal-footer"></footer>'),
            ("SEO footer hidden", first, '<footer class="public-legal-footer ">', '<footer hidden class="public-legal-footer ">'),
            ("SEO footer in template", first, '<footer class="public-legal-footer ">', '<template><footer class="public-legal-footer ">'),
            ("SEO identity wrong", first, '20568568J', '00000000X<!--20568568J-->'),
            ("SEO cookie ID missing", first, 'id="public-cookies"', 'id="other-cookies"'),
            ("SEO access in footer", first, '</footer>', '<a href="/login">Iniciar sesión</a></footer>'),
            ("SEO duplicate header access", first, '</header>', '<a href="/login" class="extra">Iniciar sesión</a></header>'),
            ("SEO commented header access", first, '<a class="seo-nav-access" href="/login">Iniciar sesión</a>', '<!--<a class="seo-nav-access" href="/login">Iniciar sesión</a>-->'),
            ("SEO cookie button hidden", first, '<button type="button"', '<button hidden type="button"'),
            ("SEO fake comments footer", first, '<footer class="public-legal-footer ">', '<!--<footer class="public-legal-footer ">'),
            ("CSS route commented only", STYLES, '"login": Object.freeze(["' + policy.LEGAL_CSS + '"])', '"login": Object.freeze([/*"' + policy.LEGAL_CSS + '"*/])'),
            ("CSS global selector", css, '.public-legal-footer {', '.public-legal-footer, body {'),
            ("CSS layer only commented", css, '@layer auth', '/* @layer auth */'),
            ("CSS outside layer", css, '@layer auth {', 'body {color:red;} @layer auth {'),
            ("CSS hides footer", css, 'color: #fff;', 'display: none;'),
            ("copy only in comment", EXTREME, 'description.textContent = ' + json.dumps(COPY, ensure_ascii=False) + ';', '/* description.textContent = ' + json.dumps(COPY, ensure_ascii=False) + '; */ description.textContent = "";'),
            ("copy overwritten", EXTREME, 'copy.append(title, description);', 'description.textContent = ""; copy.append(title, description);'),
            ("copy not inserted", EXTREME, 'head.insertAdjacentElement("afterend", notice);', '/* head.insertAdjacentElement("afterend", notice); */'),
        ]
        for name, path, old, new in cases:
            with self.subTest(name=name):
                self.restore()
                self.mutate(path, old, new)
                self.assertTrue(self.errors(), name + " must fail")

    def test_actual_checkout_remains_accepted(self):
        result = subprocess.run(["python3", str(Path(__file__).with_name("public_home_integrity.py"))], env={**os.environ, "ONION_REPO_ROOT": str(ROOT)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
