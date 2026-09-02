# Política de seguridad

La seguridad de Onion Support se trata de forma privada. **No abras un issue público para informar de una vulnerabilidad, credenciales expuestas o datos sensibles.**

## Cómo reportar una vulnerabilidad

Si GitHub ofrece la opción de **reportar una vulnerabilidad de forma privada** en la pestaña Security del repositorio, utiliza ese canal preferentemente.

Si esa opción no está disponible, escribe a `cristian@onionsupport.com` con un asunto que identifique claramente que se trata de un reporte de seguridad.

Incluye, cuando sea posible:

- superficie o ruta afectada;
- pasos mínimos de reproducción;
- impacto observado o potencial;
- versión, navegador o entorno relevante;
- capturas o trazas sanitizadas, sin secretos ni datos personales innecesarios;
- cualquier mitigación temporal que hayas comprobado.

## Alcance

Este repositorio contiene exclusivamente el frontend. Los hallazgos relacionados con autenticación, autorización, ACL, API, almacenamiento o infraestructura pueden requerir investigación fuera de este repositorio, aunque se manifiesten inicialmente en la SPA.

## Divulgación responsable

Evita publicar detalles explotables mientras el problema esté siendo investigado o corregido. No incluyas tokens, cookies de sesión, SAS, contraseñas, credenciales Microsoft ni otros secretos reales en el reporte.
