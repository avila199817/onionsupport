from pathlib import Path

path = Path('.github/scripts/router_runtime_contract.mjs')
text = path.read_text()

text = text.replace(
    '"router.minimal.v15-public-auth-short-circuit"',
    '"router.minimal.v16-private-runtime-after-guard"',
    1,
)

anchor = '''assert.equal(
  executeRenderSource.includes("refreshResolveStartedAt"),
  false,
  "Router must not retain the redundant post-auth route resolution"
);
'''
addition = '''assert.equal(
  executeRenderSource.includes("refreshResolveStartedAt"),
  false,
  "Router must not retain the redundant post-auth route resolution"
);

const guardIndex = executeRenderSource.indexOf("const guardStartedAt =");
const slugRedirectIndex = executeRenderSource.indexOf("if (\\n      slugRedirect");
const privateRuntimeIndex = executeRenderSource.indexOf("const privateRuntimeStartedAt =");
const renderRouteIndex = executeRenderSource.indexOf("return await renderRoute(");
assert.ok(
  guardIndex >= 0 &&
  slugRedirectIndex > guardIndex &&
  privateRuntimeIndex > slugRedirectIndex &&
  renderRouteIndex > privateRuntimeIndex,
  "private runtime must start only after access/user-scope guards and before owner view render"
);
assert.equal(
  executeRenderSource.includes('"private-runtime"'),
  true,
  "private runtime activation must remain an explicit Router phase"
);

const goAfterLoginStart = source.indexOf("function goAfterLogin(");
const goAfterLoginEnd = source.indexOf("\\nfunction goHome(", goAfterLoginStart);
assert.ok(
  goAfterLoginStart >= 0 && goAfterLoginEnd > goAfterLoginStart,
  "Router contract must isolate goAfterLogin()"
);
const goAfterLoginSource = source.slice(goAfterLoginStart, goAfterLoginEnd);
assert.equal(
  goAfterLoginSource.includes('authCall("syncAuthState", false)'),
  true,
  "post-login navigation must synchronize the new authenticated Core state"
);
assert.equal(
  /force:\\s*true/.test(goAfterLoginSource),
  true,
  "post-login navigation must force a fresh transition across the guest/auth boundary"
);
'''

if anchor not in text:
    raise SystemExit('router contract executeRender anchor missing')
text = text.replace(anchor, addition, 1)

text = text.replace(
    '"Router runtime contract OK · public auth-wait short-circuit · native Core port · explicit private phase telemetry"',
    '"Router runtime contract OK · public auth short-circuit · private runtime after guard · forced post-login transition · native Core port"',
    1,
)

path.write_text(text)
print('router runtime contract adapted to v16/private runtime lifecycle')
