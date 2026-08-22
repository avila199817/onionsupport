#!/usr/bin/env python3
from pathlib import Path

path = Path("src/views/facturas/index.js")
text = path.read_text(encoding="utf-8")

old = '''const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/clientes",
  "/api/users",
  "/api/clientes/search",
  "/api/users/search",
  "/api/usuarios/search",
  "/api/search/clientes",
  "/api/search/users",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/tickets",
  "/api/incidencias",
  "/api/tickets/search",
  "/api/incidencias/search",
  "/api/search/tickets",
  "/api/search/incidencias",
]);'''

new = '''/*
  Búsquedas de selección para alta de Facturas.
  Priorizar los routers /api/search canónicos del backend y conservar sólo
  fallbacks que existen realmente. Evita 404 legacy y, sobre todo, evita que
  /api/clientes (listado general) intercepte una consulta antes del buscador.
*/
const CLIENT_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/clientes",
  "/api/search/users",
  "/api/users",
]);

const TICKET_SEARCH_ENDPOINTS = Object.freeze([
  "/api/search/tickets",
  "/api/search/incidencias",
  "/api/tickets",
  "/api/incidencias",
]);'''

if old not in text:
    raise SystemExit("FACTURAS_SEARCH_ENDPOINT_BLOCK_NOT_FOUND")

updated = text.replace(old, new, 1)
if updated == text:
    raise SystemExit("FACTURAS_SEARCH_ENDPOINT_BLOCK_UNCHANGED")

path.write_text(updated, encoding="utf-8")
print("Facturas canonical search endpoints patched")
