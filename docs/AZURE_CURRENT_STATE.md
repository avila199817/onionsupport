# Onion Support — estado Azure actual

**Última validación:** 2026-09-17  
**Ámbito:** estado operativo vigente después del cierre de la revisión de costes y observabilidad

Este documento resume el estado Azure estructural actual de Onion Support. La evidencia detallada de la auditoría de costes, Log Analytics, Storage, Backup y decisiones de no-cambio vive en el backend:

- [`oniontech/docs/production/2026-09-17-azure-cost-observability-close.md`](https://github.com/avila199817/oniontech/blob/main/docs/production/2026-09-17-azure-cost-observability-close.md)
- [`oniontech/docs/COMO_LO_TENEMOS_AHORA.md`](https://github.com/avila199817/oniontech/blob/main/docs/COMO_LO_TENEMOS_AHORA.md)

Para historia anterior de la auditoría y limpieza de septiembre, consultar [`AZURE_INFRASTRUCTURE.md`](AZURE_INFRASTRUCTURE.md). Cuando exista divergencia entre un inventario histórico y este documento, prevalece este estado más reciente, siempre sujeto a una lectura nueva de Azure antes de una actuación destructiva.

## 1. Backend productivo

La autoridad productiva de Azure Container Apps es:

```text
Resource Group:      onion-web
Container App:       oniontech-aca-zr
Managed Environment: onion-aca-env-zr
Region:              Spain Central
VNet:                vnet-onion-prod
ACA subnet:          snet-aca-infra
Revision mode:       Single
Scale:               min 2 / max 3
CPU:                 0.25 vCPU por réplica
Memory:              0.5 GiB por réplica
```

Corte observado el 2026-09-17:

```text
latestRevisionName      = oniontech-aca-zr--0000057
latestReadyRevisionName = oniontech-aca-zr--0000057
```

`GET https://api.onionsupport.com/readyz` devolvió HTTP 200 con `ready=true`, `status=ready` y los checks `process`, `configuration`, `database`, `storage` y `mail` en `ok`. `mail=configuration-only` acredita configuración, no entrega de correo.

El stack ACA legacy permanece retirado; no se recrea por inercia.

## 2. Decisión de capacidad

La revisión de costes del 10 al 16 de septiembre de 2026 observó aproximadamente `3.131 EUR` de coste de Container Apps. El `96.07 %` del coste ACA observado correspondió a meters `Idle`.

La decisión vigente es **conservar**:

- 0.25 vCPU;
- 0.5 GiB;
- mínimo 2 réplicas;
- máximo 3 réplicas;
- redundancia zonal del Managed Environment.

No existe evidencia económica o técnica que justifique reducir disponibilidad para perseguir un ahorro marginal. Cualquier cambio futuro de escalado debe actualizar también la política del repositorio backend; un cambio manual aislado puede ser restaurado por el workflow de producción.

## 3. DNS y dominio API

`api.onionsupport.com` continúa siendo el dominio canónico de la API y resuelve al Container App ZR.

El registro `asuid.api` se conserva por el binding de dominio personalizado. Azure DNS sigue siendo la autoridad DNS pública de `onionsupport.com` y Squarespace permanece como registrador.

No se modificó DNS durante la revisión de costes.

## 4. Frontend — Azure Static Web Apps

Recurso productivo:

```text
Resource Group: onionsupport-rg
Static Web App: onion-panel
SKU:            Free
Branch:         main
```

Dominios productivos:

- `onionsupport.com`;
- `www.onionsupport.com`.

El frontend continúa en el SKU Free; no existe una reducción de coste aplicable por bajar ese plan.

## 5. Cosmos DB

Estado vigente:

```text
Account:               onionsupport-db-es
Resource Group:        onion-web
Database:              onionsupport
Region:                Spain Central
Mode:                  Serverless
Consistency:           Session
Public Network Access: Disabled
Auth mode backend:     Managed Identity
Private Endpoint:      pe-cosmos-onionsupport
Private DNS zone:      privatelink.documents.azure.com
```

El coste observado de Cosmos en la muestra 2026-09-10..16 fue aproximadamente `0.037 EUR`. La eficiencia de RU sigue siendo una preocupación técnica válida, pero no se considera una palanca económica principal en este corte.

No abrir el firewall ni recuperar master keys para diagnóstico rutinario. Usar el procedimiento canónico del backend.

## 6. Storage productivo

```text
Storage account:  onionassets
Resource Group:   rg-onion-storage
Region:           Spain Central
SKU:              Standard_ZRS
Private Endpoint: pe-onionassets-blob
Private DNS zone: privatelink.blob.core.windows.net
```

El backend usa Managed Identity con `Storage Blob Data Contributor`.

La muestra 2026-09-10..16 registró aproximadamente `0.616 EUR` en `onionassets`. El coste estaba dominado por operaciones, no por capacidad almacenada. Por ello no se eliminaron blobs, no se cambió tier y no se degradó ZRS.

### 6.1 Diagnostic settings de Storage

Estado vigente desde el 2026-09-17:

**Cuenta `onionassets`:**

```text
Capacity     enabled
Transaction  disabled
```

**Servicio `blobServices/default`:**

```text
Capacity       enabled
Transaction    disabled
StorageRead    enabled
StorageWrite   enabled
StorageDelete  enabled
```

La categoría `Transaction` dejó de exportarse a Log Analytics en ambos ámbitos. Las métricas nativas de Azure Monitor siguen disponibles y los logs Blob se conservaron. Una comprobación posterior observó 0 registros de esa exportación y 6297 registros `StorageBlobLogs` en las dos horas observables consultadas.

No reactivar `Transaction` por inercia: hacerlo sólo si aparece un consumidor concreto que necesite esa exportación en Log Analytics.

## 7. Log Analytics

Workspace:

```text
Name:           law-onionsupport-prod
Resource Group: onion-web
SKU:            PerGB2018
Retention:      30 days
Daily quota:    0.2 GB/day
Quota reset:    18:00 UTC
```

La cuota anterior era 0.1 GB/día y produjo eventos `OverQuota` diarios entre el 10 y el 16 de septiembre. El 17 de septiembre se elevó a 0.2 GB/día para recuperar margen de observabilidad después de reducir la exportación innecesaria de métricas Storage.

En la lectura de cierre del 2026-09-17T13:47Z:

```text
State:                  RespectQuota
OverQuota since change: 0 observed events
Observed current cycle: 0.110269 GB / 19 hours
```

Ese ciclo era incompleto. El primer ciclo completo posterior al cambio empieza el 2026-09-17T18:00Z y termina el 2026-09-18T18:00Z. La auditoría no queda abierta por ello: la cuota de 0.2 GB/día es el baseline operativo y sólo debe revisarse si reaparece `OverQuota`, cambia materialmente el coste o se pierde observabilidad necesaria.

La ampliación de cuota **no es una medida de ahorro** y puede permitir más ingesta facturable. En la muestra económica anterior, Log Analytics figuró con coste `0 EUR`.

## 8. Azure Backup de `onionassets`

Protección vigente:

```text
Backup Vault:   bv-onionsupport-prod
Resource Group: rg-onion-backups
State:          ProtectionConfigured
Policy:         bp-onionassets-vaulted-30d
Schedule:       daily at 03:00 UTC
Retention:      30 days in VaultStore
```

Containers protegidos:

- `avatars`;
- `bimi`;
- `facturasonionsupport`;
- `tickets`.

Los trabajos del 10 al 16 de septiembre se observaron `Completed`. El trabajo del 17 de septiembre terminó:

```text
Start:  2026-09-17T03:00:09.3034969Z
End:    2026-09-17T03:22:38.979687Z
Status: Completed
Errors: none
```

Se conservan frecuencia, retención, contenedores protegidos y locks administrados por Backup. Jobs completados no sustituyen una prueba de restauración.

## 9. Private Endpoints y aislamiento

Se conservan:

- `pe-cosmos-onionsupport`;
- `pe-onionassets-blob`;
- las zonas Private DNS correspondientes;
- la VNet productiva.

En la muestra económica, cada Private Endpoint aportó aproximadamente `1.417 EUR` en siete días. No se elimina aislamiento privado para reducir ese coste sin una decisión explícita de arquitectura y seguridad.

## 10. Locks y housekeeping

El storage mantiene el lock administrado por Azure Backup:

```text
AzureBackupLock-DoNotDelete
CanNotDelete
```

No eliminar ni recrear manualmente ese lock durante housekeeping normal.

Permanece la excepción histórica de RBAC legacy sobre `onionassets` documentada en la auditoría anterior. No se debe degradar Backup únicamente para limpiar un assignment inerte; cualquier limpieza debe tener una ventana específica y validar protección antes y después.

## 11. Reglas operativas actuales

1. `oniontech-aca-zr` es el único backend ACA productivo.
2. `onion-aca-env-zr` es el único Managed Environment ACA operativo de Onion Support.
3. No reducir las dos réplicas mínimas sólo por coste sin nueva evidencia.
4. Cosmos y Blob continúan privados mediante Managed Identity + Private Endpoint + Private DNS.
5. No usar master keys para diagnóstico rutinario.
6. No tocar locks administrados por Azure Backup como parte de limpieza ordinaria.
7. `law-onionsupport-prod` usa 0.2 GB/día de cuota y 30 días de retención; reabrir la decisión sólo con evidencia nueva.
8. No reactivar la exportación Storage `Transaction` a Log Analytics sin consumidor identificado.
9. Después de cambios estructurales, validar DNS, `/readyz`, inventario, locks y Backup.
10. Para Cost Management automatizado usar un `ClientType` propio y estable, actualmente `OnionSupportCostAudit`, y respetar los `retry-after` de Azure.

## 12. Criterio de cierre

La revisión Azure de costes y observabilidad del 2026-09-17 está **cerrada**. No se mantiene una lista artificial de «más optimizaciones» por hacer.

Reabrir únicamente si aparece una desviación concreta:

- `OverQuota` repetido con la nueva cuota;
- incremento de coste no explicado por uso real;
- escalado sostenido o cambio relevante en meters activos de ACA;
- fallo de Backup o de una prueba de restauración;
- pérdida de readiness;
- necesidad real de telemetría que hoy no se exporta;
- cambio de requisitos de disponibilidad, RTO/RPO o aislamiento.

Fuera de esos casos, el baseline es **conservar la arquitectura y medir antes de tocar**.
