#!/usr/bin/env python3
"""Exercise the trusted hero sizing transition with positive/negative data."""

from pathlib import Path
import unittest

from public_home_integrity_core import (
    HERO_SIZES_LEGACY,
    HERO_SIZES_MEASURED,
    hero_sizes_policy_errors,
)


ROOT = Path(__file__).resolve().parents[2]
MEASURED_CSS = """
@layer auth {
  .public-auth-shell--home, .public-auth-shell--home * { box-sizing: border-box; }
  .public-home-hero { padding: clamp(36px, 4.2vw, 64px) var(--public-home-page-gutter) clamp(40px, 5vw, 76px); }
  .public-home-profile-card--command { inline-size: 100%; border: 1px solid blue; }
  .public-home-command-hero, .public-home-command-stat { border: 1px solid blue; }
  .public-home-command-portrait { border: 1px solid blue; }
  .public-home-command-photo { inline-size: 100%; }
  @media (max-width: 720px) {
    .public-auth-shell--home { --public-home-page-gutter: 20px; }
    .public-home-hero-visual, .public-home-hero-visual--profile { inline-size: 100%; max-inline-size: 660px; }
    .public-home-profile-command { padding: 14px; }
    .public-home-command-hero { padding: 16px; grid-template-columns: 1fr; }
  }
}
"""


class HeroSizesPolicy(unittest.TestCase):
    def errors(self, css=MEASURED_CSS, experience="", sizes=HERO_SIZES_MEASURED):
        return hero_sizes_policy_errors([sizes], [sizes], css, experience)

    def test_published_variant_remains_compatible(self):
        self.assertEqual(self.errors(
            (ROOT / "src/css/views/public/index.css").read_text(),
            (ROOT / "src/css/views/public/home-experience.css").read_text(),
            HERO_SIZES_LEGACY,
        ), [])

    def test_measured_variant_matches_all_supported_geometry(self):
        self.assertEqual(self.errors(), [])

    def test_preload_must_match_either_variant(self):
        for first, second in ((HERO_SIZES_LEGACY, HERO_SIZES_MEASURED), (HERO_SIZES_MEASURED, HERO_SIZES_LEGACY)):
            with self.subTest(first=first):
                self.assertTrue(hero_sizes_policy_errors([first], [second], MEASURED_CSS, ""))

    def test_missing_and_duplicate_declarations_fail(self):
        for template, preload in (([], []), ([HERO_SIZES_LEGACY], []),
                                  ([HERO_SIZES_LEGACY] * 2, [HERO_SIZES_LEGACY] * 2)):
            with self.subTest(template=template, preload=preload):
                self.assertTrue(hero_sizes_policy_errors(template, preload, MEASURED_CSS, ""))

    def test_unknown_formulas_fail_even_when_equal(self):
        for sizes in ("100vw", HERO_SIZES_MEASURED.replace("594px", "600px"),
                      HERO_SIZES_MEASURED.replace("106px", "90px"),
                      HERO_SIZES_MEASURED.replace("206px", "216px")):
            with self.subTest(sizes=sizes):
                self.assertTrue(self.errors(sizes=sizes))

    def test_each_measured_dimension_is_required(self):
        for before, after in (("20px", "14px"), ("660px", "700px"), ("14px", "18px"),
                              ("16px", "12px"), ("1fr", "1fr 1fr"), ("1px solid", "2px solid"),
                              ("border-box", "content-box"), ("inline-size: 100%", "inline-size: 90%")):
            with self.subTest(before=before):
                self.assertTrue(self.errors(MEASURED_CSS.replace(before, after)))

    def test_mobile_declarations_cannot_move_to_desktop(self):
        self.assertTrue(self.errors(MEASURED_CSS.replace("max-width: 720px", "min-width: 721px")))

    def test_comments_cannot_supply_geometry(self):
        self.assertTrue(self.errors(MEASURED_CSS.replace("--public-home-page-gutter: 20px;", "/* --public-home-page-gutter: 20px; */")))

    def test_unbalanced_css_fails_closed(self):
        self.assertTrue(self.errors(MEASURED_CSS[:-2]))

    def test_later_declaration_or_horizontal_alias_fails(self):
        for declaration in ("padding: 18px;", "padding-inline: 18px;"):
            with self.subTest(declaration=declaration):
                self.assertTrue(self.errors(MEASURED_CSS.replace("padding: 14px;", "padding: 14px; " + declaration)))

    def test_narrower_width_cannot_change_geometry(self):
        self.assertTrue(self.errors(MEASURED_CSS + "@media (max-width: 400px) { .public-home-command-hero { padding: 4px; } }"))

    def test_border_override_fails(self):
        self.assertTrue(self.errors(MEASURED_CSS + ".public-home-command-portrait { border-width: 2px; }"))

    def test_experience_cannot_override_gutter_or_geometry(self):
        for experience in (
            ".public-auth-shell--home { --public-home-page-gutter: 14px; }",
            ".public-home .public-home-command-hero { padding: 8px; }",
        ):
            with self.subTest(experience=experience):
                self.assertTrue(self.errors(experience=experience))
        self.assertEqual(self.errors(experience=".public-home-command-hero { border-color: red; }"), [])


if __name__ == "__main__":
    unittest.main()
