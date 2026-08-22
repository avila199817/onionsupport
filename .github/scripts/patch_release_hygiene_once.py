#!/usr/bin/env python3
from pathlib import Path

path = Path('.github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml')
text = path.read_text(encoding='utf-8')

old_stage = '''          install -m 0644 "${source_root}/.github/scripts/repo_integrity.py"             "${destination}/repo_integrity.py"\n          install -m 0755 "${source_root}/.github/ci/validate_candidate_paths.py" "${destination}/validate_candidate_paths.py"'''
new_stage = '''          install -m 0644 "${source_root}/.github/scripts/repo_integrity.py"             "${destination}/repo_integrity.py"\n          install -m 0644 "${source_root}/.github/scripts/artifact_hygiene.py"           "${destination}/artifact_hygiene.py"\n          install -m 0755 "${source_root}/.github/ci/validate_candidate_paths.py" "${destination}/validate_candidate_paths.py"'''

old_run = '''      - name: Validate repository integrity\n        env:\n          ONION_REPO_ROOT: ${{ github.workspace }}/candidate\n        run: |\n          set -euo pipefail\n          python3 "${RUNNER_TEMP}/onion-validation/repo_integrity.py"\n\n      - name: Validate production SEO and routing contract'''
new_run = '''      - name: Validate repository integrity\n        env:\n          ONION_REPO_ROOT: ${{ github.workspace }}/candidate\n        run: |\n          set -euo pipefail\n          python3 "${RUNNER_TEMP}/onion-validation/repo_integrity.py"\n\n      - name: Validate repository artifact hygiene\n        env:\n          ONION_REPO_ROOT: ${{ github.workspace }}/candidate\n        run: |\n          set -euo pipefail\n          python3 "${RUNNER_TEMP}/onion-validation/artifact_hygiene.py"\n\n      - name: Validate production SEO and routing contract'''

if old_stage not in text:
    raise SystemExit('RELEASE_HYGIENE_STAGE_BLOCK_NOT_FOUND')
if old_run not in text:
    raise SystemExit('RELEASE_HYGIENE_RUN_BLOCK_NOT_FOUND')

text = text.replace(old_stage, new_stage, 1).replace(old_run, new_run, 1)
path.write_text(text, encoding='utf-8')
print('Azure release hygiene gate patched')
