#!/usr/bin/env python3
from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact target, got {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")


def regex_once(path, pattern, replacement):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: regex target count={count}")
    p.write_text(updated, encoding="utf-8")


config = "src/core/config.js"
replace_once(
    config,
    'export const CONFIG_VERSION = "core.config.production.v4-same-origin-api";',
    'export const CONFIG_VERSION = "core.config.production.v5-route-contract";',
)
replace_once(
    config,
    '  usuarios: "/usuarios",\n  servidor: "/servidor",',
    '  usuarios: "/usuarios",\n  correo: "/correo",\n  servidor: "/servidor",',
)
replace_once(
    config,
    '  ROUTES.usuarios,\n  ROUTES.servidor,',
    '  ROUTES.usuarios,\n  ROUTES.correo,\n  ROUTES.servidor,',
)

routes = "src/router/routes.js"
replace_once(
    routes,
    '  "routes.minimal.v8.3-cuenta-legacy-alias";',
    '  "routes.minimal.v8.4-canonical-visibility";',
)
replace_once(
    routes,
    '''  tokenRoute = false,\n  order = 0,\n}) {''',
    '''  tokenRoute = false,\n  showInSidebar = true,\n  searchable = true,\n  order = 0,\n}) {''',
)
replace_once(
    routes,
    '''    sidebar: !finalPublic,\n    showInSidebar: !finalPublic,\n    sidebarKey: finalViewKey,''',
    '''    sidebar:\n      !finalPublic &&\n      showInSidebar !== false,\n    showInSidebar:\n      !finalPublic &&\n      showInSidebar !== false,\n    searchable:\n      !finalPublic &&\n      searchable !== false,\n    sidebarKey: finalViewKey,''',
)
replace_once(
    routes,
    '''    title: "Ajustes",\n    viewKey: "ajustes",\n    order: 80,''',
    '''    title: "Ajustes",\n    viewKey: "ajustes",\n    showInSidebar: false,\n    searchable: false,\n    order: 80,''',
)

topbar = "src/ui/topbar/index.js"
replace_once(
    topbar,
    '  "topbar.controller.backend-search.v6-hardened";',
    '  "topbar.controller.backend-search.v7-canonical-routes";',
)
replace_once(
    topbar,
    '''          route.public !==\n            true &&\n          route.hideShell !==\n            true''',
    '''          route.public !==\n            true &&\n          route.hideShell !==\n            true &&\n          route.searchable !==\n            false''',
)
regex_once(
    topbar,
    r'''function normalizeRole\(\n  value = ""\n\) \{.*?\n\}\n\nfunction normalizeRoleList''',
    '''function normalizeRole(\n  value = ""\n) {\n  const role =\n    cleanText(\n      value,\n      ""\n    ).toLowerCase();\n\n  return role === ROLE_ADMIN\n    ? ROLE_ADMIN\n    : role === ROLE_USER\n      ? ROLE_USER\n      : "";\n}\n\nfunction normalizeRoleList''',
)

sidebar_index = "src/ui/sidebar/index.js"
replace_once(
    sidebar_index,
    'import { AppCore } from "../../core/index.js";\n',
    'import { AppCore } from "../../core/index.js";\nimport { sanitizeRuntimeImageUrl } from "../../core/media.js";\n',
)
replace_once(
    sidebar_index,
    '  "sidebar.controller.v3-hardened";',
    '  "sidebar.controller.v4-canonical-media";',
)
regex_once(
    sidebar_index,
    r'''function safeImageUrl\(\n  value = ""\n\) \{.*?\n\}\n\nfunction initialsFrom''',
    '''function safeImageUrl(\n  value = ""\n) {\n  return sanitizeRuntimeImageUrl(\n    value,\n    {\n      allowRelative: true,\n      allowBlobObjectUrl: true,\n      allowSameOrigin: true,\n      allowOnionApi: true,\n      allowAzureBlob: true,\n      allowAzureBlobSas: true,\n    }\n  );\n}\n\nfunction initialsFrom''',
)
replace_once(
    sidebar_index,
    '''  if (\n    clean ===\n    ROUTES.ajustes\n  ) {\n    return "ajustes";\n  }\n\n''',
    '',
)

sidebar_template = "src/ui/sidebar/template.js"
replace_once(
    sidebar_template,
    '''import {\n  ROUTES,\n  USER_HOME_PREFIX,\n  SENSITIVE_QUERY_PARAMS,''',
    '''import {\n  ROUTES,\n  USER_HOME_PREFIX,''',
)
replace_once(
    sidebar_template,
    '} from "../../core/config.js";\n',
    '} from "../../core/config.js";\nimport { sanitizeRuntimeImageUrl } from "../../core/media.js";\n',
)
replace_once(
    sidebar_template,
    '  "sidebar.template.unified.v4-single-account-entry";',
    '  "sidebar.template.unified.v5-runtime-media-policy";',
)
regex_once(
    sidebar_template,
    r'''const SENSITIVE_QUERY_KEYS = new Set\(.*?\n\);\n\n''',
    '',
)
regex_once(
    sidebar_template,
    r'''function hasSensitiveQuery\(value = ""\) \{.*?\n\}\n\nfunction normalizeInternalPath''',
    '''function hasSensitiveQuery(value = "") {\n  const raw = String(value || "");\n  return /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(raw);\n}\n\nfunction normalizeInternalPath''',
)
regex_once(
    sidebar_template,
    r'''function safeImageSrc\(value = "", fallback = ""\) \{.*?\n\}\n\n/\* =========================================================\n   USER / ITEM NORMALIZATION''',
    '''function safeImageSrc(value = "", fallback = "") {\n  return (\n    sanitizeRuntimeImageUrl(\n      value,\n      {\n        allowRelative: true,\n        allowBlobObjectUrl: true,\n        allowSameOrigin: true,\n        allowOnionApi: true,\n        allowAzureBlob: true,\n        allowAzureBlobSas: true,\n      }\n    ) ||\n    sanitizeRuntimeImageUrl(\n      fallback,\n      {\n        allowRelative: true,\n        allowBlobObjectUrl: true,\n        allowSameOrigin: true,\n        allowOnionApi: true,\n        allowAzureBlob: true,\n        allowAzureBlobSas: true,\n      }\n    )\n  );\n}\n\n/* =========================================================\n   USER / ITEM NORMALIZATION''',
)

config_text = Path(config).read_text(encoding="utf-8")
routes_text = Path(routes).read_text(encoding="utf-8")
topbar_text = Path(topbar).read_text(encoding="utf-8")
sidebar_text = Path(sidebar_template).read_text(encoding="utf-8")

assert 'correo: "/correo"' in config_text
assert 'ROUTES.correo' in config_text
assert 'showInSidebar: false' in routes_text
assert 'searchable: false' in routes_text
assert 'route.searchable !==' in topbar_text
assert 'SENSITIVE_QUERY_PARAMS' not in sidebar_text
assert 'sanitizeRuntimeImageUrl' in sidebar_text
