// Production verification reasons about immutable identities, never about a moving main.
//
// WHY THE TIP OF main IS THE WRONG EXPECTATION
//
// "Production should match main" sounds right and is not checkable, because the tip of
// main is not a revision production was necessarily ever asked to serve:
//
// - the deploy workflow declares `paths-ignore: [".github/**", "docs/**"]`, so a push to
//   main touching only those never deploys at all. The tip can therefore be a revision
//   that production will never serve, and comparing against it is red forever, not
//   transiently.
// - a deploy takes minutes and its runs are serialized (`cancel-in-progress: false`), so
//   even a tip that will deploy is not live yet while the next PR check runs.
//
// The only honest expectation is an immutable one: the revision the deploy pipeline last
// SUCCESSFULLY shipped. That identity is captured once, at job start, and never re-read
// from a branch name afterwards.
//
// THE THREE STATES
//
// - exact-match: production byte-matches the captured baseline. Nothing moved.
// - superseded-by-newer-verified-main: production does not match the captured baseline,
//   and a STRICTLY NEWER successful production deploy exists. Production legitimately
//   moved on while this job ran.
// - genuine-mismatch: everything else, including every case where the evidence needed to
//   decide is missing. Fail closed.
//
// WHY "superseded" HIDES NOTHING
//
// This is the load-bearing argument, so it is written down rather than assumed. Deferring
// is safe only because the superseding revision is not trusted on its word: every
// successful deploy triggers this same gate through `workflow_run`, on the leg that
// rebuilds that exact head SHA and byte-compares all of production against it. So when a
// pre-merge run reports `superseded`, the revision production actually moved to is already
// covered by its own mandatory, exact verification. A real discrepancy still turns a run
// red; it is simply attributed to the revision that owns it instead of to an unrelated PR.
//
// If that post-deploy leg were ever removed or made optional, `superseded` would stop being
// safe and this module's contract would be broken. tools/production-dist-workflow-regression.mjs
// asserts the leg exists for exactly that reason.

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function isRunId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeRun(run) {
  if (!run || typeof run !== "object") return null;
  const sha = typeof run.sha === "string" ? run.sha.trim().toLowerCase() : "";
  const runId = typeof run.runId === "number" ? run.runId : Number.NaN;
  if (!SHA_PATTERN.test(sha)) return null;
  if (!isRunId(runId)) return null;
  if (run.conclusion !== "success") return null;
  return Object.freeze({ sha, runId });
}

// The newest successful production deploy among the runs handed in. Anything that is not a
// successful deploy with a well-formed identity is not a candidate: a cancelled, failed or
// still-running deploy never became production, and a malformed record is not evidence.
export function selectDeployedBaseline(runs) {
  const candidates = (Array.isArray(runs) ? runs : []).map(normalizeRun).filter(Boolean);
  if (!candidates.length) return null;
  return candidates.reduce((best, run) => (run.runId > best.runId ? run : best));
}

// Fail-closed classification. `matched` is the verdict of the real byte comparison against
// the captured baseline; `newest` is the newest successful deploy observed AFTER that
// comparison, used only to tell "production moved on" apart from "production is wrong".
export function classifyProductionSkew({ baseline, matched, newest } = {}) {
  const captured = normalizeRun(baseline);
  if (!captured) return "genuine-mismatch";
  if (matched === true) return "exact-match";

  const superseding = normalizeRun(newest);
  if (!superseding) return "genuine-mismatch";
  if (superseding.runId <= captured.runId) return "genuine-mismatch";
  if (superseding.sha === captured.sha) return "genuine-mismatch";

  return "superseded-by-newer-verified-main";
}

// A classification only ever means "do not fail this run" for the one deferring state.
export function isVerificationFailure(state) {
  return state !== "exact-match" && state !== "superseded-by-newer-verified-main";
}
