#!/usr/bin/env python3
"""Exercise legacy/v3 SEO validation without Azure, production writes or app code."""
from pathlib import Path
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ("/", "/reparacion-ordenadores", "/soporte-informatico", "/redes-wifi", "/impresoras", "/soporte-empresas", "/login")
HOME_TITLE = "Soporte informático y asistencia técnica | Onion Support"


def load_module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verifier = load_module("production_verifier", ".github/scripts/production_verify.py")
integrity = load_module("home_integrity", ".github/scripts/public_home_integrity_core.py")


class PublicSitePolicy(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / ".github/ci").mkdir(parents=True)
        (self.root / ".github/scripts").mkdir()
        (self.root / "seo").mkdir()
        for relative in (".github/scripts/public_path_hygiene.py", ".github/ci/validate_production_contract.sh", "staticwebapp.config.json", "robots.txt"):
            shutil.copyfile(ROOT / relative, self.root / relative)
        for marker in ("canonical-apex-v1", "seo-public-surface-v2"):
            (self.root / ".github/ci" / marker).write_text(marker + "\n")
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.make_mode(False)

    def tearDown(self):
        self.temp.cleanup()

    def make_mode(self, v3):
        marker = self.root / ".github/ci/public-site-v3"
        if v3:
            marker.write_text("public-site-v3\n")
        else:
            marker.unlink(missing_ok=True)
        config_path = self.root / "staticwebapp.config.json"
        config = json.loads(config_path.read_text())
        for path in PUBLIC:
            robots = "noindex, follow" if v3 and path == "/login" else "index, follow"
            target = next(route for route in config["routes"] if route["route"] == path)
            target["headers"]["X-Robots-Tag"] = robots
            url = "https://onionsupport.com" + path
            title = HOME_TITLE if path == "/" else "Servicio | Onion Support"
            html = f'<html><head><title>{title}</title><meta name="description" content="Soporte informático remoto en España."><link rel="canonical" href="{url}"><meta property="og:url" content="{url}">' + "".join(f'<meta name="{name}" content="{robots}">' for name in ("robots", "googlebot", "bingbot")) + '</head><body><h1>Soporte</h1><a href="/">Inicio</a><a href="/login">Iniciar sesión</a></body></html>'
            relative = "index.html" if path == "/" else ("login.html" if path == "/login" else "seo" + path + ".html")
            (self.root / relative).write_text(html)
        config_path.write_text(json.dumps(config))
        urls = [path for path in PUBLIC if not (v3 and path == "/login")]
        (self.root / "sitemap.xml").write_text('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f'<url><loc>https://onionsupport.com{path}</loc></url>' for path in urls) + '</urlset>')

    def run_validator(self, valid=True, contains=None):
        result = subprocess.run(["bash", ".github/ci/validate_production_contract.sh"], cwd=self.root, env={**os.environ, "PUBLIC_SITE_URL": "https://onionsupport.com", "DIRECT_API_URL": "https://api.onionsupport.com"}, capture_output=True, text=True)
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode == 0, valid, output)
        if contains:
            self.assertIn(contains, output)

    def mutate(self, path, old, new):
        target = self.root / path
        source = target.read_text()
        self.assertIn(old, source)
        target.write_text(source.replace(old, new))

    def test_legacy_still_requires_indexable_login(self):
        self.run_validator()
        self.mutate("login.html", 'content="index, follow"', 'content="noindex, follow"')
        self.run_validator(False, "Meta robots")

    def test_postdeploy_reads_policy_from_immutable_checkout(self):
        workflow = (ROOT / ".github/workflows/production-verification.yml").read_text()
        step = workflow.split("- name: Verify compiled production security, routing and backend", 1)[1].split("- name:", 1)[0]
        self.assertRegex(step, r"(?m)^\s+working-directory: verification-tooling$")
        self.assertRegex(step, r"(?m)^\s+run: bash \.github/ci/verify_production\.sh$")
        checkout = self.root / "verification-tooling"
        marker = checkout / ".github/ci/public-site-v3"
        marker.parent.mkdir(parents=True)
        # Execute the real verifier's policy selection, before any HTTP probes.
        bootstrap = (ROOT / ".github/ci/verify_production.sh").read_text().split("legacy_frontend=", 1)[0]
        command = bootstrap + '\nprintf "%s" "$public_site_v3"\n'
        env = {**os.environ, "PUBLIC_SITE_URL": "https://onionsupport.com", "DIRECT_API_URL": "https://api.onionsupport.com"}
        parent_marker = self.root / ".github/ci/public-site-v3"
        for selected_v3 in (True, False):
            if selected_v3:
                marker.write_text("public-site-v3\n")
                parent_marker.unlink(missing_ok=True)
            else:
                marker.unlink(missing_ok=True)
                parent_marker.write_text("public-site-v3\n")
            result = subprocess.run(["bash", "-c", command], cwd=checkout, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, str(selected_v3).lower(), "The workspace parent must not choose the deployed policy")
        marker.write_text("invalid-version\n")
        result = subprocess.run(["bash", "-c", command], cwd=checkout, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, "An invalid checkout marker must still fail")

    def test_v3_accepts_noindex_login(self):
        self.make_mode(True)
        self.run_validator()

    def test_v3_rejects_login_indexable_html(self):
        self.make_mode(True)
        self.mutate("login.html", 'content="noindex, follow"', 'content="index, follow"')
        self.run_validator(False, "Meta robots")

    def test_v3_rejects_login_indexable_header(self):
        self.make_mode(True)
        self.mutate("staticwebapp.config.json", '"X-Robots-Tag": "noindex, follow"', '"X-Robots-Tag": "index, follow"')
        self.run_validator(False, "X-Robots-Tag")

    def test_v3_rejects_home_noindex(self):
        self.make_mode(True)
        self.mutate("index.html", 'content="index, follow"', 'content="noindex, follow"')
        self.run_validator(False, "Meta robots")

    def test_v3_rejects_login_in_sitemap(self):
        self.make_mode(True)
        self.mutate("sitemap.xml", "</urlset>", "<url><loc>https://onionsupport.com/login</loc></url></urlset>")
        self.run_validator(False, "Sitemap inesperado")

    def test_v3_rejects_blocked_login(self):
        self.make_mode(True)
        self.mutate("robots.txt", "Allow: /", "Allow: /\nDisallow: /login")
        self.run_validator(False, "rastreable")

    def test_v3_rejects_wildcard_block(self):
        self.make_mode(True)
        self.mutate("robots.txt", "Allow: /", "Allow: /\nDisallow: /lo*")
        self.run_validator(False, "rastreable")

    def test_v3_rejects_wrong_home_title(self):
        self.make_mode(True)
        self.mutate("index.html", f"<title>{HOME_TITLE}</title>", "<title>Otra marca</title>")
        self.run_validator(False, "título SEO canónico")

    def test_v3_rejects_marker_drift(self):
        self.make_mode(True)
        (self.root / ".github/ci/public-site-v3").write_text("public-site-v3\nextra\n")
        self.run_validator(False, "marcador")

    def test_v3_rejects_conflicting_duplicate_robots(self):
        self.make_mode(True)
        self.mutate("login.html", "</head>", '<meta name="robots" content="noindex, follow"></head>')
        self.run_validator(False, "exactamente una vez")

    def test_v3_rejects_canonical_service_to_home(self):
        self.make_mode(True)
        self.mutate("seo/redes-wifi.html", 'href="https://onionsupport.com/redes-wifi"', 'href="https://onionsupport.com/"')
        self.run_validator(False, "Canonical esperado")

    def test_postdeploy_legacy_and_v3_headers(self):
        original = verifier.fetch
        try:
            for v3 in (False, True):
                def fake(base, path, revision, attempt):
                    robots = "noindex, nofollow" if path in verifier.NOINDEX_ROUTES else ("noindex, follow" if v3 and path == "/login" else "index, follow")
                    return 200, b'<script src="/src/main.js"></script>', {"x-robots-tag": robots}
                verifier.fetch = fake
                self.assertEqual(verifier.check_routes("https://onionsupport.com", "fixture", 1, v3=v3), [])
            verifier.fetch = lambda *args: (200, b'<script src="/src/main.js"></script>', {"x-robots-tag": "index, follow"})
            self.assertTrue(any("/login" in error for error in verifier.check_routes("https://onionsupport.com", "fixture", 1, v3=True)))
        finally:
            verifier.fetch = original

    def test_postdeploy_marker_is_exact(self):
        self.assertFalse(verifier.public_site_v3(self.root))
        self.make_mode(True)
        self.assertTrue(verifier.public_site_v3(self.root))
        (self.root / ".github/ci/public-site-v3").write_text("public-site-v3")
        with self.assertRaises(ValueError):
            verifier.public_site_v3(self.root)


if __name__ == "__main__":
    unittest.main()
