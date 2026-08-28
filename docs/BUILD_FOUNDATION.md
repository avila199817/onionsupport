# Frontend Build Foundation

The frontend build is pinned to Node 22.23.2, npm 10.9.8 and Vite 8.2.2.
It emits fingerprinted production assets together with a private release envelope.

## Pull request trust boundary

1. Candidate source is built and exercised in a job with no secrets, no write
   permission and no persisted checkout credentials.
2. Trusted tooling from the immutable base rebuilds the candidate data without
   executing candidate JavaScript in a browser.
3. The candidate artifact and trusted rebuild must match byte for byte.
4. The preview job downloads the validated trusted artifact by immutable ID,
   validates its exact `dist` plus `build-metadata` envelope, and deploys
   only `dist`.
5. Build tooling, package metadata and release sidecars must remain unavailable
   from the public site.

## Local verification

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:ci
```

A missing local Chrome installation may prevent only the browser contract. CI
provides Chromium and treats that contract as mandatory.

## Production activation gate

Production uses the `compiled-dist-v1` contract only after a canary proved the
trusted `dist` preview with JavaScript enabled and disabled, valid routing and
headers, public home and login behavior, and the authenticated application
boundary. The verifier hardening was merged separately before activation so
the activation preview itself runs against that trusted base.

## Emergency rollback

The production workflow exposes a manual `legacy-root` mode pinned to
`edbdf2429b85a3de405d18aa58bd85eb319bd6de`, the last repository-root release
whose deployment and independent production gate both completed successfully
(workflow runs `33142535574` and `33142594975`). The rollback checks out that
immutable revision, deploys `/` without a build, and blocks on exact bytes for
both the Azure environment and `https://onionsupport.com`, followed by the
security, routing, CORS and backend verifier.

After an incident is understood, manual `compiled-dist` mode rebuilds the
current `main` revision through the normal no-secret artifact boundary. The
known-good SHA must not be changed without equivalent successful deployment
and independent-gate evidence.
