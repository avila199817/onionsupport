# Onion Support — estado Azure actual

**Última validación:** 2026-09-07  
**Ámbito:** estado operativo actual después del cierre del rollback ACA legacy

Este documento resume el estado Azure vigente después de la limpieza estructural del 2026-09-07. Para historia detallada de la auditoría anterior, consultar [`AZURE_INFRASTRUCTURE.md`](AZURE_INFRASTRUCTURE.md). Cuando exista divergencia entre ese inventario histórico y este documento, prevalece este estado más reciente.

## 1. Backend productivo

La única autoridad productiva de Azure Container Apps es:

```text
Resource Group:      onion-web
Container App:       oniontech-aca-zr
Managed Environment: onion-aca-env-zr
Region:              Spain Central
VNet:                vnet-onion-prod
ACA subnet:          snet-aca-infra
```

El stack legacy fue retirado completamente el 2026-09-07:

```text
oniontech-aca       ELIMINADO
onion-aca-env       ELIMINADO
managed certificate legacy ELIMINADO
binding api.onionsupport.com legacy ELIMINADO
```

El inventario final de `onion-web` mostró únicamente:

- `oniontech-aca-zr`;
- `onion-aca-env-zr`;
- `mc-onion-aca-env-zr-api-onionsupport`.

## 2. DNS y dominio API

`api.onionsupport.com` resuelve al FQDN del ACA ZR:

```text
oniontech-aca-zr.livelyfield-44cb45ba.spaincentral.azurecontainerapps.io
```

Durante la validación del 2026-09-07 la resolución A observada fue `70.156.190.144`.

El registro `asuid.api` se conserva porque coincide con el `customDomainVerificationId` del ACA productivo.

## 3. Readiness productivo

Después de eliminar app y environment legacy se verificó:

```json
{
  "ready": true,
  "status": "ready",
  "revision": "oniontech-aca-zr--0000014",
  "checks": {
    "process": "ok",
    "configuration": "ok",
    "database": "ok",
    "storage": "ok",
    "mail": "ok"
  }
}
```

La revisión concreta es evidencia del corte del 2026-09-07, no un identificador permanente. La autoridad de producción sigue siendo `api.onionsupport.com` y el ACA `oniontech-aca-zr`.

## 4. Cosmos DB

Estado vigente:

```text
Account:              onionsupport-db-es
Resource Group:       onion-web
Database:             onionsupport
Region:               Spain Central
Mode:                 Serverless
Consistency:          Session
Public Network Access: Disabled
Auth mode backend:    Managed Identity
Private Endpoint:     pe-cosmos-onionsupport
Private DNS zone:     privatelink.documents.azure.com
```

Containers SQL conocidos:

| Container | Partition key |
|---|---|
| `sessions` | `/userId` |
| `clientes` | `/id` |
| `tickets` | `/ticketId` |
| `users_lookup` | `/id` |
| `facturas` | `/clienteId` |
| `hardware` | `/userId` |
| `usuarios` | `/userId` |
| `settings` | `/userId` |

El role assignment Cosmos SQL de la Managed Identity legacy fue eliminado durante el decommission. El ACA ZR conserva `Cosmos DB Built-in Data Contributor`.

Para inspección manual de Cosmos no se debe abrir el firewall ni usar master keys. El procedimiento canónico vive en el backend:

[`avila199817/oniontech/docs/COSMOS_DB_ACCESS.md`](https://github.com/avila199817/oniontech/blob/main/docs/COSMOS_DB_ACCESS.md)

## 5. Storage productivo

```text
Storage account: onionassets
Resource Group:  rg-onion-storage
Region:          Spain Central
SKU:             Standard_ZRS
Private Endpoint: pe-onionassets-blob
```

El ACA productivo usa Managed Identity con `Storage Blob Data Contributor`.

### 5.1 Azure Backup de `onionassets`

Se verificó protección real mediante Azure Data Protection:

```text
Backup Vault:   bv-onionsupport-prod
Resource Group: rg-onion-backups
State:          ProtectionConfigured
Policy:         bp-onionassets-vaulted-30d
```

Containers protegidos por la policy observada:

- `avatars`;
- `bimi`;
- `facturasonionsupport`;
- `tickets`.

El storage mantiene un lock administrado por Backup:

```text
AzureBackupLock-DoNotDelete
CanNotDelete
```

**No eliminar ni recrear manualmente ese lock durante housekeeping normal.**

## 6. Excepción de housekeeping conocida

Permanece un role assignment antiguo sobre `onionassets`:

```text
Role: Storage Blob Data Contributor
Role assignment id: 71784ffb-5b15-41ed-a370-06053b09d527
```

El assignment pertenecía al principal del ACA legacy retirado. No se eliminó durante el decommission porque la operación queda protegida por el lock administrado de Azure Backup.

Clasificación: **housekeeping pendiente / excepción segura**.

No se debe parar Backup, quitar `AzureBackupLock-DoNotDelete` ni degradar protección de `onionassets` únicamente para retirar este objeto RBAC inerte. Si se decide limpiarlo, debe abrirse una ventana específica de mantenimiento de Backup y validar protección antes y después.

## 7. Locks relevantes

El patrón operativo sigue siendo `CanNotDelete` para recursos críticos. Excepción importante: `onionassets` puede tener más de un lock porque Azure Backup añade su protección administrada además de la protección explícita de Onion Support.

No asumir que todos los locks duplicados son basura: primero distinguir locks creados por Onion Support de locks administrados por Azure.

## 8. Resultado del decommission ACA legacy

Completado el 2026-09-07:

- DNS productivo confirmado sobre ZR;
- tráfico reciente confirmado sobre ZR;
- hostname legacy retirado;
- managed certificate legacy retirado;
- Cosmos SQL RBAC legacy retirado;
- `Cost Management Reader` legacy retirado;
- `oniontech-aca` eliminado;
- `onion-aca-env` eliminado;
- producción validada después de cada fase;
- `oniontech-aca-zr` permaneció Healthy/Running;
- `/readyz` siguió verde tras el cierre.

La evidencia detallada está en el issue `avila199817/oniontech#498` y en el informe backend `docs/production/2026-09-07-aca-legacy-decommission.md`.

## 9. Reglas operativas actuales

1. `oniontech-aca-zr` es el único backend ACA productivo.
2. `onion-aca-env-zr` es el único Managed Environment ACA operativo de Onion Support.
3. No recrear infraestructura legacy por inercia; cualquier rollback futuro debe ser explícito y temporal.
4. Cosmos debe continuar privado: Managed Identity + Private Endpoint + Private DNS.
5. No usar master keys de Cosmos para diagnóstico rutinario.
6. No tocar locks administrados por Azure Backup como parte de limpieza ordinaria.
7. Separar siempre Azure RBAC, Cosmos SQL RBAC y permisos de Backup al auditar identidades.
8. Después de cambios estructurales, validar DNS, `/readyz`, inventario y locks antes de cerrar.

## 10. Próximo housekeeping

Pendiente deliberado:

- evaluar en una ventana específica de Backup la retirada del role assignment legacy de `onionassets`;
- revisar periódicamente que `bv-onionsupport-prod` siga en `ProtectionConfigured`;
- mantener este documento sincronizado con Azure después de cambios estructurales.
