#!/usr/bin/env python3
"""Trusted public-home policy layered on the byte-identical core contract."""

from __future__ import annotations

import importlib.util
import os
import re
from html.parser import HTMLParser
from pathlib import Path

LEGACY_DIMENSION_MESSAGES = frozenset(
    {
        "Falta anchura intrínseca del técnico",
        "Falta altura intrínseca del técnico",
    }
)

WEBP_FALLBACK = (
    'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = '
    '"/src/media/img/Cristian_Avila_Formulario_960.webp";'
)
LEGACY_PNG_FALLBACK = (
    'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = '
    '"/src/media/img/Cristian_Avila_Formulario.png";'
)
LEGACY_PNG_PATHS = (
    "src/media/img/Cristian_Avila.png",
    "src/media/img/Cristian_Avila_Formulario.png",
)

LEGAL_MODULE = "src/core/public-legal.js"
LEGAL_CSS = "/src/css/views/public/legal-footer.css"
SEO_PAGES = tuple(f"seo/{name}.html" for name in (
    "reparacion-ordenadores", "soporte-informatico", "redes-wifi", "impresoras", "soporte-empresas",
))
LEGAL_IDS = ("public-legal-notice", "public-privacy", "public-cookies")
LEGAL_IDENTITY = {
    "name": "Onion Support", "owner": "Cristian Ávila Luque", "taxId": "20568568J",
    "address": "C/ Rafael de Casanova, 54, 1.º 3.ª, 08295 Sant Vicenç de Castellet (Barcelona)",
    "email": "soporte@onionsupport.com", "phone": "629 946 615", "phoneHref": "+34629946615",
}
MODERN_REPLACED_MESSAGES = frozenset({
    "La landing debe nombrar /login como Iniciar sesión en header y footer",
    "El footer debe ocultar login/cuenta",
    "La UI debe explicar la reutilización por correo O teléfono",
    "La UI debe declarar no-overwrite de usuario existente",
    *(f"{path} debe usar Iniciar sesión en sus dos enlaces a /login" for path in SEO_PAGES),
})


def js_tokens(source):
    """Small static lexer: comments are discarded; strings/templates stay opaque.

    It never imports/evaluates candidate JavaScript. Nested template expressions
    are scanned to distinguish a literal backtick from an expression backtick.
    The policy below deliberately accepts only the explicit renderer shapes.
    """
    def quoted(start, quote):
        index = start + 1
        while index < len(source):
            if source[index] == "\\":
                index += 2
            elif source[index] == quote:
                return index + 1
            elif quote == "`" and source.startswith("${", index):
                index = expression_end(index + 2)
            else:
                index += 1
        raise ValueError("literal JavaScript sin cerrar")

    def expression_end(start):
        depth, index = 1, start
        while index < len(source):
            if source.startswith("//", index):
                index = source.find("\n", index)
                if index < 0:
                    break
            elif source.startswith("/*", index):
                end = source.find("*/", index + 2)
                if end < 0:
                    break
                index = end + 2
            elif source[index] in "\"'`":
                index = quoted(index, source[index])
            else:
                if source[index] == "{":
                    depth += 1
                elif source[index] == "}":
                    depth -= 1
                    if not depth:
                        return index + 1
                index += 1
        raise ValueError("interpolación JavaScript sin cerrar")

    tokens, index = [], 0
    while index < len(source):
        if source[index].isspace():
            index += 1
        elif source.startswith("//", index):
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
        elif source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end < 0:
                raise ValueError("comentario JavaScript sin cerrar")
            index = end + 2
        elif source[index] in "\"'`":
            end = quoted(index, source[index])
            tokens.append(("template" if source[index] == "`" else "string", source[index + 1:end - 1]))
            index = end
        elif source[index] == "/" and (not tokens or tokens[-1] in [("code", value) for value in ("(", "=", ":", ",", "[", "return", "!", "&", "|", "?")]):
            end, in_class = index + 1, False
            while end < len(source):
                if source[end] == "\\":
                    end += 2
                    continue
                if source[end] == "[":
                    in_class = True
                elif source[end] == "]":
                    in_class = False
                elif source[end] == "/" and not in_class:
                    end += 1
                    while end < len(source) and source[end].isalpha():
                        end += 1
                    break
                end += 1
            else:
                raise ValueError("regex JavaScript sin cerrar")
            tokens.append(("regex", source[index:end]))
            index = end
        else:
            match = re.match(r"[A-Za-z_$][\w$]*|\d+", source[index:])
            value = match.group() if match else source[index]
            tokens.append(("code", value))
            index += len(value)
    return tokens


def code(tokens):
    return " ".join(value if kind == "code" else ('"' + value + '"' if kind == "string" else "`TEMPLATE`") for kind, value in tokens)


def balanced(tokens, start, opening, closing):
    if tokens[start] != ("code", opening):
        raise ValueError(f"se esperaba {opening}")
    depth = 0
    for index in range(start, len(tokens)):
        if tokens[index] == ("code", opening):
            depth += 1
        elif tokens[index] == ("code", closing):
            depth -= 1
            if not depth:
                return index
    raise ValueError(f"bloque {opening} sin cerrar")


def function_parts(tokens, name):
    matches = [index for index in range(len(tokens) - 1)
               if tokens[index:index + 2] == [("code", "function"), ("code", name)]]
    if len(matches) != 1:
        raise ValueError(f"{name}: debe existir una única función real")
    start = matches[0] + 2
    end = balanced(tokens, start, "(", ")")
    body_end = balanced(tokens, end + 1, "{", "}")
    return tokens[start + 1:end], tokens[end + 2:body_end]


def returned(tokens, name):
    params, body = function_parts(tokens, name)
    returns = [index for index, token in enumerate(body) if token == ("code", "return")]
    if len(returns) != 1:
        raise ValueError(f"{name}: debe tener un único retorno directo")
    position = returns[0]
    prefix = body[:position]
    if any(token == ("code", word) for token in prefix for word in ("if", "throw", "for", "while", "switch", "try", "function")):
        raise ValueError(f"{name}: retorno condicionado o inaccesible")
    expression = body[position + 1:]
    if expression and expression[-1] == ("code", ";"):
        expression = expression[:-1]
    return params, prefix, expression


def return_template(tokens, name):
    params, prefix, expression = returned(tokens, name)
    if len(expression) != 1 or expression[0][0] != "template":
        raise ValueError(f"{name}: debe devolver directamente su template")
    return params, prefix, expression[0][1]


def has_import(tokens, name, source):
    expected = f'import {{ {name} }} from "{source}" ;'
    pattern = js_tokens(expected)
    return sum(tokens[index:index + len(pattern)] == pattern for index in range(len(tokens))) == 1


def sequence_count(tokens, source):
    pattern = js_tokens(source)
    return sum(tokens[index:index + len(pattern)] == pattern for index in range(len(tokens)))


def interpolations(template):
    template = re.sub(r"<!--[\s\S]*?-->", "", template)
    output, index = [], 0
    while index < len(template):
        start = template.find("${", index)
        if start < 0:
            break
        cursor, depth = start + 2, 1
        while cursor < len(template) and depth:
            character = template[cursor]
            if character in "\"'`":
                quote = character
                cursor += 1
                while cursor < len(template):
                    if template[cursor] == "\\":
                        cursor += 2
                    elif template[cursor] == quote:
                        cursor += 1
                        break
                    else:
                        cursor += 1
                continue
            if character == "{":
                depth += 1
            elif character == "}":
                depth -= 1
            cursor += 1
        if depth:
            raise ValueError("interpolación de renderer sin cerrar")
        output.append(js_tokens(template[start + 2:cursor - 1]))
        index = cursor
    return output


class PublicHtml(HTMLParser):
    """Inspect actual elements; comments/script strings cannot satisfy policy."""
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.nodes, self.stack = [], []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        parent = self.stack[-1] if self.stack else None
        hidden = bool(parent and parent["hidden"]) or tag in {"script", "style", "template", "noscript"} or "hidden" in attributes or attributes.get("aria-hidden") == "true" or bool(re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", attributes.get("style", ""), re.I))
        node = {"tag": tag, "attrs": attributes, "parent": parent, "hidden": hidden, "text": "", "duplicates": len(attributes) != len(attrs)}
        self.nodes.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1]["tag"] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return

    def handle_data(self, text):
        if not self.stack or self.stack[-1]["hidden"]:
            return
        for node in self.stack:
            node["text"] += text

    def within(self, node, ancestor):
        parent = node["parent"]
        while parent:
            if parent is ancestor:
                return True
            parent = parent["parent"]
        return False

    def visible(self, tag):
        return [node for node in self.nodes if node["tag"] == tag and not node["hidden"]]


def check_footer(source, label):
    document = PublicHtml(source)
    footers = [node for node in document.nodes if node["tag"] == "footer"]
    if len(footers) != 1 or footers[0]["hidden"] or "public-legal-footer" not in footers[0]["attrs"].get("class", "").split():
        raise ValueError(f"{label}: debe haber un único footer legal visible")
    footer = footers[0]
    descendants = [node for node in document.nodes if document.within(node, footer)]
    if any(node["duplicates"] for node in [footer, *descendants]):
        raise ValueError(f"{label}: atributos duplicados en footer")
    for key in ("name", "owner", "taxId", "address", "email", "phone"):
        if LEGAL_IDENTITY[key] not in " ".join(footer["text"].split()):
            raise ValueError(f"{label}: falta identidad visible {key}")
    for identifier in LEGAL_IDS:
        matches = [node for node in document.nodes if node["attrs"].get("id") == identifier]
        if len(matches) != 1 or matches[0]["tag"] != "details" or matches[0]["hidden"] or not document.within(matches[0], footer):
            raise ValueError(f"{label}: falta details único y visible {identifier}")
        if not any(node["tag"] == "summary" and node["parent"] is matches[0] and node["text"].strip() for node in descendants):
            raise ValueError(f"{label}: details {identifier} sin summary accesible")
    buttons = [node for node in descendants if "data-public-cookie-settings" in node["attrs"]]
    if len(buttons) != 1 or buttons[0]["tag"] != "button" or buttons[0]["attrs"].get("type") != "button" or buttons[0]["hidden"] or buttons[0]["text"].strip() != "Configurar cookies":
        raise ValueError(f"{label}: falta botón visible de cookies")
    if any(node["tag"] == "a" and re.search(r"(?:^|/)login(?:[/?#]|$)", node["attrs"].get("href", "")) for node in descendants):
        raise ValueError(f"{label}: el footer no puede contener acceso a /login")
    for href in ("mailto:" + LEGAL_IDENTITY["email"], "tel:" + LEGAL_IDENTITY["phoneHref"]):
        if not any(node["tag"] == "a" and not node["hidden"] and node["attrs"].get("href") == href for node in descendants):
            raise ValueError(f"{label}: falta contacto canónico {href}")
    return document


def legal_template_html(tokens):
    declaration = js_tokens("const PUBLIC_LEGAL = Object.freeze({")
    declarations = [index for index in range(len(tokens)) if tokens[index:index + len(declaration)] == declaration]
    if len(declarations) != 1:
        raise ValueError("Falta declaración única PUBLIC_LEGAL")
    start = declarations[0] + len(declaration) - 1
    end = balanced(tokens, start, "{", "}")
    properties, index = {}, start + 1
    while index < end:
        key, colon, value = tokens[index:index + 3]
        if key[0] not in ("code", "string") or colon != ("code", ":") or value[0] != "string" or key[1] in properties:
            raise ValueError("PUBLIC_LEGAL debe contener datos literales únicos")
        properties[key[1]] = value[1]
        index += 3
        if index < end:
            if tokens[index] != ("code", ","):
                raise ValueError("PUBLIC_LEGAL contiene un valor no literal")
            index += 1
    for key, value in LEGAL_IDENTITY.items():
        if properties.get(key) != value:
            raise ValueError(f"PUBLIC_LEGAL: dato obligatorio incorrecto {key}")
    if any(token == ("code", word) for token in tokens for word in ("import", "window", "document", "fetch", "eval")):
        raise ValueError("El renderer legal debe ser un módulo puro")
    _, prefix, template = return_template(tokens, "renderPublicLegalFooter")
    if prefix:
        raise ValueError("El renderer legal debe retornar sin efectos previos")

    def replace(match):
        expression = re.sub(r"\s+", "", code(js_tokens(match.group(1))))
        if expression == "escape(className)":
            return ""
        if expression == "supportLink()":
            return f'<a href="mailto:{LEGAL_IDENTITY["email"]}">{LEGAL_IDENTITY["email"]}</a>'
        for key, value in LEGAL_IDENTITY.items():
            if expression in (f"PUBLIC_LEGAL.{key}", f"escape(PUBLIC_LEGAL.{key})"):
                return value
        raise ValueError("Interpolación legal no reconocida: " + expression)

    # supportLink is a deliberately fixed, side-effect-free contact helper.
    support_pattern = [("code", "const"), ("code", "supportLink"), ("code", "="), ("code", "("), ("code", ")"), ("code", "="), ("code", ">"), ("template", '<a href="mailto:${PUBLIC_LEGAL.email}">${PUBLIC_LEGAL.email}</a>'), ("code", ";")]
    if not any(tokens[index:index + len(support_pattern)] == support_pattern for index in range(len(tokens))):
        raise ValueError("supportLink debe usar el contacto canónico")
    return re.sub(r"\$\{([^{}]*)\}", replace, template)


def css_policy(source):
    source = re.sub(r"/\*[\s\S]*?\*/", "", source).strip()
    if not source.startswith("@layer auth") or not re.match(r"@layer\s+auth\s*\{", source):
        raise ValueError("CSS legal debe declarar @layer auth")
    def block(start):
        depth = 1
        for index in range(start + 1, len(source)):
            depth += (source[index] == "{") - (source[index] == "}")
            if depth == 0:
                return index
        raise ValueError("CSS legal desbalanceado")
    opening = source.index("{")
    if block(opening) != len(source) - 1:
        raise ValueError("CSS legal debe quedar completamente dentro de @layer auth")
    def rules(text):
        index = 0
        while index < len(text):
            match = re.search(r"([^{}]+)\{", text[index:])
            if not match:
                if text[index:].strip():
                    raise ValueError("CSS legal contiene contenido fuera de una regla")
                return
            selector = match.group(1).strip()
            start = index + match.end() - 1
            depth, end = 1, start + 1
            while end < len(text) and depth:
                depth += (text[end] == "{") - (text[end] == "}")
                end += 1
            if depth:
                raise ValueError("CSS legal desbalanceado")
            content = text[start + 1:end - 1]
            if selector.startswith("@media "):
                rules(content)
            elif selector.startswith("@"):
                raise ValueError("CSS legal contiene una regla global no permitida")
            else:
                # Commas inside :is/:not are not selector separators.
                branches = re.split(r",(?![^()]*\))", selector)
                for branch in branches:
                    branch = branch.strip()
                    scoped = re.match(r"^\.public-legal-footer(?:__[\w-]+)?(?:\b|[\s:])", branch) or re.match(r"^html(?::(?:is|not)\([^)]*\)|\[[^]]+\]|\.[\w-]+)*\s+\.public-legal-footer\b", branch)
                    if not scoped or re.match(r"^\.public-legal-footer\s*[+~]", branch):
                        raise ValueError("CSS legal contiene un selector sin scope: " + branch)
                if selector == ".public-legal-footer" and re.search(r"display\s*:\s*none|visibility\s*:\s*hidden", content):
                    raise ValueError("CSS legal no puede ocultar el footer")
            index = end
    rules(source[opening + 1:-1])


def footer_policy_errors(core):
    """Presence opts into the entire new contract, never into a blanket skip."""
    root = Path(core.ROOT)
    if not (root / LEGAL_MODULE).exists():
        return []
    try:
        def read(path):
            return (root / path).read_text(encoding="utf-8")
        legal = js_tokens(read(LEGAL_MODULE))
        check_footer(legal_template_html(legal), "renderer compartido")
        home = js_tokens(read("src/views/public/home/template.js"))
        shell = js_tokens(read("src/views/public/index.js"))
        if not has_import(home, "renderPublicLegalFooter", "../../../core/public-legal.js") or not has_import(shell, "renderPublicLegalFooter", "../../core/public-legal.js"):
            raise ValueError("Home y shell deben importar el renderer compartido real")
        _, prefix, expression = returned(home, "createPublicHomeTemplate")
        if prefix or expression[:3] != [("code", "renderPublicShell"), ("code", "("), ("code", "{")] or expression[-2:] != [("code", "}"), ("code", ")")]:
            raise ValueError("Home debe devolver directamente renderPublicShell")
        home_code = code(expression)
        if home_code.count("footer : false") != 1 or len(re.findall(r"\bfooter\s*:", home_code)) != 1:
            raise ValueError("Home debe desactivar una sola vez el footer del shell")
        bodies = [expression[index + 2][1] for index in range(len(expression) - 2) if expression[index:index + 2] == [("code", "body"), ("code", ":")] and expression[index + 2][0] == "template"]
        if len(bodies) != 1:
            raise ValueError("Home debe tener un único body template")
        body_html = PublicHtml(bodies[0])
        body_text = " ".join(node["text"] for node in body_html.nodes if node["parent"] is None)
        for call in ("renderPublicLegalFooter", "renderHeader"):
            marker = "${" + call + "()}"
            if bodies[0].count(marker) != 1 or body_text.count(marker) != 1 or interpolations(bodies[0]).count(js_tokens(call + "()")) != 1:
                raise ValueError("Home debe renderizar una sola vez y visiblemente " + call)
        if "<footer" in bodies[0]:
            raise ValueError("Home no puede duplicar manualmente el footer")
        params, _, shell_template = return_template(shell, "renderPublicShell")
        if code(params).count("footer = true") != 1:
            raise ValueError("Shell público debe habilitar footer por defecto")
        shell_marker = '${footer ? renderPublicLegalFooter() : ""}'
        if shell_template.count(shell_marker) != 1 or shell_template.count("renderPublicLegalFooter(") != 1:
            raise ValueError("Shell debe renderizar exactamente una vez el footer opcional")
        shell_html = PublicHtml(shell_template)
        if not any(shell_marker in node["text"] for node in shell_html.nodes if not node["hidden"]):
            raise ValueError("Footer del shell no puede quedar oculto/comentado")
        _, header_prefix, header = return_template(home, "renderHeader")
        if sequence_count(home, 'loginPath: "/login"') != 1 or header_prefix != js_tokens('const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");'):
            raise ValueError("Header Home debe resolver /login canónico")
        header = header.replace("${escapeAttr(loginHref)}", "/login")
        headers = PublicHtml(header)
        links = [node for node in headers.nodes if node["tag"] == "a" and node["attrs"].get("href") == "/login"]
        if len(links) != 1 or links[0]["hidden"] or links[0]["text"].strip() != "Iniciar sesión" or links[0]["attrs"].get("data-public-home-login") != "true":
            raise ValueError("Header Home debe contener un único Iniciar sesión")
        if not any(headers.within(links[0], node) for node in headers.visible("header")):
            raise ValueError("Acceso Home debe estar dentro del header")
        for relative in SEO_PAGES:
            document = check_footer(read(relative), relative)
            login_links = [node for node in document.nodes if node["tag"] == "a" and node["attrs"].get("href") == "/login"]
            if len(login_links) != 1 or login_links[0]["hidden"] or login_links[0]["text"].strip() != "Iniciar sesión" or not any(document.within(login_links[0], header) for header in document.visible("header")):
                raise ValueError(relative + ": acceso /login único y visible en header")
            if len([node for node in document.nodes if node["tag"] == "link" and node["attrs"].get("rel") == "stylesheet" and node["attrs"].get("href") == LEGAL_CSS]) != 1:
                raise ValueError(relative + ": falta CSS legal único")
        styles = js_tokens(read("src/router/styles.js"))
        manifest_prefix = js_tokens("const STYLE_MANIFEST = Object.freeze({")
        manifest_starts = [index + len(manifest_prefix) - 1 for index in range(len(styles)) if styles[index:index + len(manifest_prefix)] == manifest_prefix]
        if len(manifest_starts) != 1:
            raise ValueError("Falta manifest CSS real")
        start = manifest_starts[0]
        manifest = styles[start + 1:balanced(styles, start, "{", "}")]
        for route in ("public-home", "login", "password-request", "password-reset", "activate-account"):
            route_prefix = js_tokens(": Object.freeze([")
            entries = []
            for index in range(len(manifest)):
                if manifest[index] in (("code", route), ("string", route)) and manifest[index + 1:index + 1 + len(route_prefix)] == route_prefix:
                    start = index + len(route_prefix)
                    entries.append(manifest[start + 1:balanced(manifest, start, "[", "]")])
            if len(entries) != 1 or entries[0].count(("string", LEGAL_CSS)) != 1:
                raise ValueError("Falta CSS legal real en ruta " + route)
        css_policy(read(LEGAL_CSS.lstrip("/")))
        extreme = js_tokens(read("src/features/public-support-extreme/index.js"))
        _, authority_body = function_parts(extreme, "ensureAuthorityNotice")
        assignment_prefix = [("code", "description"), ("code", "."), ("code", "textContent"), ("code", "=")]
        assignments = [(index, authority_body[index + 4]) for index in range(len(authority_body) - 4) if authority_body[index:index + 4] == assignment_prefix]
        expected = "Usaremos el correo y el móvil que indiques. Si ya tienes cuenta, la reutilizamos sin cambiar tus datos; si es tu primera vez, recibirás un acceso seguro."
        if len(assignments) != 1 or assignments[0][1] != ("string", expected):
            raise ValueError("Intake debe mostrar correo/móvil, reutilización y no-overwrite en description.textContent")
        for snippet in ('copy . append ( title , description ) ;', 'notice . append ( icon , copy ) ;', 'head . insertAdjacentElement ( "afterend" , notice ) ;'):
            if sequence_count(authority_body, snippet) != 1:
                raise ValueError("Intake debe insertar visiblemente el aviso de identidad")
    except (OSError, ValueError, IndexError) as error:
        return ["Public footer policy: " + str(error)]
    return []


def resolve_core_path() -> Path:
    sibling = Path(__file__).resolve().with_name("public_home_integrity_core.py")
    if sibling.is_file():
        return sibling

    workspace = Path(os.environ.get("GITHUB_WORKSPACE", "")).resolve()
    trusted = (
        workspace
        / "trusted-integrity-source"
        / ".github"
        / "scripts"
        / "public_home_integrity_core.py"
    )
    if trusted.is_file():
        return trusted

    raise FileNotFoundError("Trusted public-home core contract not found")


def load_core():
    path = resolve_core_path()
    spec = importlib.util.spec_from_file_location("onion_public_home_integrity_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load trusted public-home core: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def photo_policy_errors(core) -> list[str]:
    errors: list[str] = []
    intake = core.read("src/features/public-support/index.js")

    if WEBP_FALLBACK not in intake:
        errors.append("El fallback del técnico debe ser exclusivamente WebP 960")
    if LEGACY_PNG_FALLBACK in intake:
        errors.append("El fallback PNG legado del técnico no puede reintroducirse")

    if 'width="960"' not in intake or 'height="1200"' not in intake:
        errors.append("Las dimensiones intrínsecas del técnico deben ser 960×1200")
    if 'width="1122"' in intake or 'height="1402"' in intake:
        errors.append("Las dimensiones legacy 1122×1402 no pueden reintroducirse")

    root = Path(core.ROOT)
    for relative in LEGACY_PNG_PATHS:
        if (root / relative).exists():
            errors.append(f"Asset PNG legado reintroducido: {relative}")

    for relative, expected in (
        ("src/media/img/Cristian_Avila_Formulario_480.webp", (480, 600)),
        ("src/media/img/Cristian_Avila_Formulario_960.webp", (960, 1200)),
    ):
        try:
            actual = core.webp_dimensions(relative)
        except (OSError, ValueError) as error:
            errors.append(f"WebP inválido: {relative} ({error})")
            continue
        if actual != expected:
            errors.append(
                f"Dimensiones WebP inválidas: {relative} es {actual}, esperado {expected}"
            )

    return errors


def main() -> int:
    core = load_core()
    errors = photo_policy_errors(core)
    modern_footer = (Path(core.ROOT) / LEGAL_MODULE).exists()
    errors.extend(footer_policy_errors(core))
    if errors:
        print("\nPublic home photo policy: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    original_require = core.require

    def require_with_modern_dimensions(
        contract_errors: list[str], condition: bool, message: str
    ) -> None:
        if message in LEGACY_DIMENSION_MESSAGES or (modern_footer and message in MODERN_REPLACED_MESSAGES):
            return
        original_require(contract_errors, condition, message)

    core.require = require_with_modern_dimensions
    status = core.main()
    if status != 0:
        return status

    print(
        "Public home photo policy: PASS · WebP-only fallback 960×1200 enforced · "
        "WebP 480×600 + 960×1200 bytes verified"
    )
    if modern_footer:
        print("Public footer policy: PASS · shared renderer and public surfaces validated statically")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
