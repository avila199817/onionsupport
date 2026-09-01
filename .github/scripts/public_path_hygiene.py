#!/usr/bin/env python3
"""Reject obsolete language-prefixed public paths from the tracked repository."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
LANGUAGE_SEGMENT = bytes((0x65, 0x73))
RAW_PREFIX = bytes((0x2F,)) + LANGUAGE_SEGMENT
BOUNDARY = rb"(?=$|[/\\?&#\s\"'`<>{}\[\](),;:*])"
ENCODED_BOUNDARY = rb"(?=$|%2[fF]|[/\\?&#\s\"'`<>{}\[\](),;:*])"

PATTERNS = (
    re.compile(re.escape(RAW_PREFIX) + BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(bytes((0x5C,)) + RAW_PREFIX) + BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(bytes((0x5C, 0x5C)) + RAW_PREFIX) + BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(b"%2F" + LANGUAGE_SEGMENT) + ENCODED_BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(b"%252F" + LANGUAGE_SEGMENT) + ENCODED_BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(b"\\u002F" + LANGUAGE_SEGMENT) + BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(b"&#47;" + LANGUAGE_SEGMENT) + BOUNDARY, re.IGNORECASE),
    re.compile(re.escape(b"&#x2F;" + LANGUAGE_SEGMENT) + BOUNDARY, re.IGNORECASE),
)


def tracked_files() -> list[str]:
    output = subprocess.check_output(
        ["git", "-C", str(ROOT), "ls-files", "-z"],
        stderr=subprocess.STDOUT,
    )
    return [
        raw.decode("utf-8", errors="strict")
        for raw in output.split(b"\0")
        if raw
    ]


def read_text_candidate(path: Path) -> bytes | None:
    try:
        with path.open("rb") as handle:
            head = handle.read(8192)
            if b"\0" in head:
                return None
            return head + handle.read()
    except OSError as error:
        raise RuntimeError(f"cannot read tracked file: {error}") from error


def main() -> int:
    findings: list[tuple[str, int, str]] = []
    language_component = LANGUAGE_SEGMENT.decode("ascii").casefold()

    for relative in tracked_files():
        path = ROOT / relative
        components = [part.casefold() for part in PurePosixPath(relative).parts]
        if language_component in components:
            findings.append((relative, 1, "obsolete language path component"))

        data = read_text_candidate(path)
        if data is None:
            continue

        seen_offsets: set[int] = set()
        for pattern in PATTERNS:
            for match in pattern.finditer(data):
                if match.start() in seen_offsets:
                    continue
                seen_offsets.add(match.start())
                line = data.count(b"\n", 0, match.start()) + 1
                findings.append((relative, line, "obsolete language-prefixed public path"))

    if findings:
        for relative, line, message in sorted(set(findings)):
            print(
                f"::error file={relative},line={line},title=Public path hygiene::{message}"
            )
        print(
            "Public path hygiene: FAIL · remove every raw, escaped or encoded obsolete language-prefixed path.",
            file=sys.stderr,
        )
        return 1

    print("Public path hygiene: PASS · no obsolete language-prefixed public path is tracked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
