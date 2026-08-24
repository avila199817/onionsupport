from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


path = "src/views/facturas/facturas.api.js"
text = read(path)
text = replace_once(
    text,
    '  "facturas.api.production.v6.admin-payment-command";',
    '  "facturas.api.production.v7.paid-finalization-timeout";',
    "facturas api version",
)
text = replace_once(
    text,
    "export const FACTURAS_PAYMENT_TIMEOUT = 20000;",
    "export const FACTURAS_PAYMENT_TIMEOUT = 120000;",
    "facturas payment timeout",
)
write(path, text)

api = read("src/views/facturas/facturas.api.js")
feature = read("src/features/facturas-paid-confirm/index.js")
enhancements = read("src/app/enhancements.js")

checks = [
    ("api timeout", "export const FACTURAS_PAYMENT_TIMEOUT = 120000;" in api),
    ("api paid endpoint", 'return `${getFacturaEndpoint(id)}/pago`;' in api),
    ("api dedicated paid command", 'source: "views.facturas.mark-paid"' in api),
    ("feature explicit 120s timeout", "timeout: 120_000" in feature),
    ("feature definitive document", "definitive-document" in feature),
    ("feature retry", "Reintentar finalización" in feature),
    ("enhancement registration", 'key: "facturas-paid-confirm"' in enhancements),
]

missing = [name for name, ok in checks if not ok]
if missing:
    raise SystemExit("frontend paid-finalization contract failed: " + ", ".join(missing))

print("Paid finalization client production hardening applied cleanly.")
