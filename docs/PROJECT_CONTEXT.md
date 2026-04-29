# ONION SUPPORT — PROJECT CONTEXT / MAPA MAESTRO

## 1. Identidad del proyecto

**Nombre:** Onion Support / Onion SPA  
**Tipo:** SPA JavaScript modular  
**Idioma base:** Español (`lang="es"`)  
**Estilo:** SaaS panel premium / soporte técnico / control center

Objetivo:
- Panel profesional para gestión de soporte.
- Navegación SPA.
- Auth robusta.
- UI modular.
- i18n vivo.
- Integración backend/API.
- Persistencia de sesión.
- Cosmos DB como storage principal.

---

## 2. Stack general

### Frontend

- HTML shell: `index.html`
- JavaScript modular ES Modules
- CSS separado por responsabilidad
- SPA Router propio
- UI components propios
- i18n propio

### Backend / Data

- Azure Cosmos DB
- API propia
- Auth con token / refresh / restore session

---

## 3. CSS / Design System

Archivos principales:

```txt
src/styles/variables.css
src/styles/layout.css
src/styles/sidebar.css
src/styles/topbar.css
src/styles/loader.css
