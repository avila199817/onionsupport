# Facturas · refresh silencioso

Contrato visual fijado el 2026-08-31:

- El refresco con filas ya visibles mantiene el historial en pantalla.
- No se muestra spinner, overlay ni texto `Actualizando facturas...`.
- El estado accesible puede permanecer fuera del flujo visual.
- El loading inicial sigue usando skeleton dentro del historial.
- `.github/scripts/facturas_loading_parity_contract.py` impide regresiones.
