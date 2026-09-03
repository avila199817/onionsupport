# ONION SUPPORT — INFRAESTRUCTURA AZURE

> Actualizado: 2026-09-04.
> Este documento describe el estado productivo validado de la infraestructura Azure de Onion Support después de la auditoría y limpieza de septiembre de 2026.
>
> **Regla de seguridad:** los identificadores de tenant, suscripción, App Registration, principal y otros IDs internos se omiten intencionadamente de esta documentación pública. No son necesarios para comprender ni operar la arquitectura.

## 1. Alcance y estado canónico

La infraestructura productiva de Onion Support usa principalmente **Spain Central**, con servicios auxiliares en **West Europe** y **West US 2** cuando el servicio Azure lo requiere.

Estado validado al cierre de la auditoría:

- 7 Resource Groups;
- 32 recursos ARM visibles;
- 0 Managed Disks huérfanos;
- 0 NIC huérfanas;
- 0 Public IPs huérfanas;
- 0 snapshots;
- un único stack legacy conservado expresamente como rollback;
- locks `CanNotDelete` consolidados a una sola protección por recurso crítico;
- IAM/CI-CD separado por responsabilidad y autenticado mediante OIDC.

La autoridad operativa es Azure y el código de `main` de los repositorios correspondientes. Si este documento diverge de la infraestructura real, debe actualizarse después de verificar Azure.

## 2. Arquitectura de alto nivel

```mermaid
flowchart TD
  USER[Usuarios / Internet]

  SWA[Azure Static Web Apps\nonion-panel]
  DNS[Azure DNS\nonionsupport.com]
  API[Azure Container Apps\noniontech-aca-zr]
  ENV[ACA Managed Environment\nonion-aca-env-zr\nZone Redundant]
  VNET[VNet vnet-onion-prod]
  COSMOS[Azure Cosmos DB\nonionsupport-db-es\nServerless]
  STORAGE[Storage\nonionassets\nZRS]
  BACKUP[Backup Storage\nstoniontechbackup\nGRS]
  LAW[Log Analytics\nlaw-onionsupport-prod]
  ACS[Azure Communication Services\nonion-acs]
  EMAIL[ACS Email\nonionsupport-mail]
  ALERTS[Azure Monitor\nHealth + Restart Alerts]

  USER --> DNS
  DNS --> SWA
  DNS --> API

  API --> ENV
  ENV --> VNET
  API --> COSMOS
  API --> STORAGE
  API --> ACS
  ACS --> EMAIL

  VNET --> COSMOS
  VNET --> STORAGE

  ENV --> LAW
  COSMOS --> LAW
  STORAGE --> LAW
  ALERTS --> LAW

  BACKUP -. backup data .-> STORAGE
```

## 3. Resource Groups

| Resource Group | Región del RG | Responsabilidad |
|---|---|---|
| `onion-web` | Spain Central | Backend, Container Apps, Cosmos DB, red privada, observabilidad y ACS |
| `rg-onion-storage` | Spain Central | Storage productivo `onionassets` |
| `rg-onion-backups` | Spain Central | Storage de backup `stoniontechbackup` |
| `onionsupport-rg` | West US 2 | Static Web App, Azure DNS y ACS Email |
| `ME_onion-aca-env-zr_onion-web_spaincentral` | Spain Central | Infraestructura administrada por Azure Container Apps |
| `NetworkWatcherRG` | Spain Central | Network Watcher administrado por Azure |
| `cloud-shell-storage-westeurope` | West Europe | Persistencia de Azure Cloud Shell |

### 3.1 Grupos administrados o auxiliares

`ME_onion-aca-env-zr_onion-web_spaincentral`, `NetworkWatcherRG` y `cloud-shell-storage-westeurope` no deben tratarse como basura por el nombre.

- El grupo `ME_...` contiene infraestructura administrada por Azure Container Apps, actualmente un Load Balancer Standard y una Public IP Standard.
- `NetworkWatcherRG` contiene `NetworkWatcher_spaincentral`.
- `cloud-shell-storage-westeurope` contiene el Storage Account usado por Cloud Shell y su File Share persistente.

**No modificar manualmente los recursos del grupo `ME_...` salvo documentación oficial y necesidad explícita.**

## 4. Frontend — Azure Static Web Apps

Recurso productivo:

- Resource Group: `onionsupport-rg`
- Static Web App: `onion-panel`
- SKU: `Free`
- rama productiva: `main`
- proveedor: GitHub
- dominios personalizados:
  - `onionsupport.com`
  - `www.onionsupport.com`
- entornos activos: sólo `default`

No se detectaron staging environments o previews abandonados en la auditoría.

La aplicación frontend vive en el repositorio `avila199817/onionsupport`.

## 5. Backend — Azure Container Apps

### 5.1 Producción actual

Container App:

- nombre: `oniontech-aca-zr`
- Resource Group: `onion-web`
- región: Spain Central
- Managed Environment: `onion-aca-env-zr`
- Zone Redundant: `true`
- workload profile: `Consumption`
- ingress: público HTTPS
- target port: `8080`
- revisión activa: modo `Single`
- CPU: `1.0`
- memoria: `2 GiB`
- escalado: mínimo `2`, máximo `3` réplicas
- estado validado: 2 réplicas `Running`

El dominio productivo `api.onionsupport.com` resuelve al FQDN generado de `oniontech-aca-zr`.

### 5.2 Imagen

La aplicación usa una imagen inmutable de GHCR referenciada por digest SHA-256, no por tag mutable.

Durante la migración legacy -> ZR se validó que OLD y ZR ejecutaban exactamente el mismo digest de imagen y la misma configuración funcional relevante.

## 6. Stack legacy / rollback

El stack anterior se conserva temporalmente como rollback y **no forma parte del tráfico productivo normal**.

Recursos legacy:

- Container App: `oniontech-aca`
- Managed Environment: `onion-aca-env`
- Managed Certificate: `mc-onion-aca-env-api-onionsupport-9588`
- Diagnostic Setting del environment legacy
- System Assigned Managed Identity legacy y sus role assignments
- Contributor del principal de deploy sobre el Container App legacy
- locks `CanNotDelete` del Container App y del environment

Estado validado:

- `minReplicas = 0`
- `maxReplicas = 3`
- 0 réplicas activas
- fuera del DNS productivo
- conserva binding de `api.onionsupport.com` sólo como capacidad de rollback

El stack legacy **no debe eliminarse hasta cerrar formalmente la ventana de rollback**.

## 7. Red

### 7.1 VNet

VNet productiva:

- `vnet-onion-prod`
- address space: `10.42.0.0/16`

Subnets:

| Subnet | Prefix | Uso |
|---|---|---|
| `snet-aca-infra` | `10.42.0.0/21` | Infraestructura de Container Apps ZR |
| `snet-private-endpoints` | `10.42.16.0/24` | Private Endpoints |

### 7.2 Private Endpoints

Private Endpoints productivos:

- `pe-cosmos-onionsupport`
- `pe-onionassets-blob`

NIC asociadas:

- NIC del Private Endpoint de Cosmos DB
- NIC del Private Endpoint de Blob Storage

Estas NIC no son huérfanas y no deben eliminarse de forma independiente.

### 7.3 Private DNS

Zonas privadas:

- `privatelink.documents.azure.com`
- `privatelink.blob.core.windows.net`

Virtual Network Links:

- `link-cosmos-onion-prod`
- `link-blob-onion-prod`

## 8. Azure Cosmos DB

Cuenta productiva:

- nombre: `onionsupport-db-es`
- región: Spain Central
- modo: **Serverless**
- consistencia: `Session`
- multi-region writes: deshabilitado
- Public Network Access: deshabilitado
- autenticación local: deshabilitada
- backup: `Continuous`
- tier de backup: `Continuous30Days`

Base de datos SQL:

- `onionsupport`

Containers conocidos:

| Container | Partition Key | TTL observado |
|---|---|---|
| `sessions` | `/userId` | `-1` |
| `clientes` | `/id` | — |
| `tickets` | `/ticketId` | — |
| `users_lookup` | `/id` | — |
| `facturas` | `/clienteId` | — |
| `hardware` | `/userId` | — |
| `usuarios` | `/userId` | — |
| `settings` | `/userId` | — |

Las Managed Identities de los Container Apps productivo y legacy tienen `Cosmos DB Built-in Data Contributor` mientras dure el rollback.

## 9. Storage productivo — `onionassets`

Storage Account:

- Resource Group: `rg-onion-storage`
- región: Spain Central
- SKU: `Standard_ZRS`
- kind: `StorageV2`
- HTTPS only: habilitado
- mínimo TLS: `TLS1_2`
- Shared Key Access: deshabilitado
- versioning: habilitado
- Change Feed: habilitado
- Blob Soft Delete: 30 días
- Container Soft Delete: 30 días
- lifecycle: elimina versiones antiguas después de 30 días

Capacidad observada durante la auditoría: aproximadamente **753 MiB**.

### 9.1 Containers públicos y privados

Públicos por diseño (`PublicAccess=blob`):

- `$web`
- `avatars`
- `bimi`

Privados:

- `facturasonionsupport`
- `tickets`

Por este motivo no debe deshabilitarse globalmente el acceso público de blobs sin rediseñar antes la separación entre assets públicos y datos privados.

El backend accede al Storage mediante Managed Identity con `Storage Blob Data Contributor` y existe Private Endpoint para Blob.

## 10. Backup Storage — `stoniontechbackup`

Storage Account:

- Resource Group: `rg-onion-backups`
- datos almacenados en West Europe
- SKU: `Standard_GRS`
- Public Network Access: deshabilitado
- Shared Key Access: deshabilitado
- HTTPS only: habilitado
- mínimo TLS: `TLS1_2`
- versioning: habilitado
- Change Feed: habilitado
- Blob Soft Delete: 90 días
- Container Soft Delete: 90 días
- lifecycle: elimina versiones antiguas después de 90 días

Capacidad observada durante la auditoría: aproximadamente **47 MiB**.

Se verificó actividad real de backup mediante métricas de Storage, incluyendo operaciones `PutBlob` y `CreateContainer`, además de ingress/egress. Por tanto, este recurso no es residual.

## 11. Cloud Shell Storage

Storage Account:

- `csb100320058483f6e2`
- Resource Group: `cloud-shell-storage-westeurope`
- SKU: `Standard_LRS`
- región: West Europe

File Share persistente:

- `cs-cristian-onionsupport-com-100320058483f6e2`

El uso observado de aproximadamente **5 GiB** es coherente con la persistencia de Cloud Shell y no debe considerarse residuo.

## 12. Observabilidad

### 12.1 Log Analytics

Workspace:

- `law-onionsupport-prod`
- región: Spain Central
- SKU: `PerGB2018`
- retención: 30 días
- daily quota: `0.1 GB`

Durante la auditoría se observaron aproximadamente **117 MB ingeridos en 7 días**, incluyendo:

- Container App Console Logs
- Container App HTTP Logs
- Container App System Logs
- Azure Metrics
- Cosmos DB Data Plane Requests
- Cosmos DB Query Runtime Statistics
- Cosmos DB Partition Key Statistics
- Cosmos DB Partition Key RU Consumption
- Cosmos DB Control Plane Requests
- Storage Blob Logs

El workspace está activo y no es un recurso residual.

### 12.2 Diagnostic Settings

`onion-aca-env-zr`:

- `ContainerAppHTTPLogs`
- `AllMetrics`
- destino: `law-onionsupport-prod`

El mismo setting se mantiene temporalmente en `onion-aca-env` mientras exista el rollback.

Cosmos DB envía al workspace:

- `DataPlaneRequests`
- `QueryRuntimeStatistics`
- `PartitionKeyStatistics`
- `PartitionKeyRUConsumption`
- `ControlPlaneRequests`
- métricas `SLI`
- métricas `Requests`

Storage Accounts productivos envían métricas `Capacity` y `Transaction`.

`blobServices/default` envía:

- `StorageRead`
- `StorageWrite`
- `StorageDelete`
- métricas `Capacity`
- métricas `Transaction`

## 13. Alertas

Action Group:

- `ag-onionsupport-ops`
- habilitado
- receptor principal por email

Activity Log Alerts:

- `service-health-onionsupport`
- `resource-health-onionsupport`

Ambas cubren la suscripción y notifican al Action Group.

Metric Alert:

- `containerapp-restarts-onionsupport`
- scope actual: `oniontech-aca-zr`
- métrica: `RestartCount`
- condición: `> 3`
- ventana: 5 minutos
- frecuencia: 1 minuto
- severidad: 2

Durante la auditoría esta alerta fue migrada desde el ACA legacy al ACA ZR productivo.

## 14. DNS público

Zona:

- `onionsupport.com`

Resolución funcional validada:

- apex `onionsupport.com` -> Azure Static Web Apps
- `www.onionsupport.com` -> Azure Static Web Apps
- `api.onionsupport.com` -> `oniontech-aca-zr`
- `autodiscover.onionsupport.com` -> Microsoft 365 / Outlook
- MX -> Microsoft 365
- DKIM selector 1/2 -> Microsoft 365
- DKIM específico de Azure Communication Services -> Azure Communication Services

DMARC de dominio raíz:

```text
v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@onionsupport.com
```

Durante la auditoría se eliminó un TXT mal formado cuyo nombre relativo generaba accidentalmente:

```text
_dmarc.mail.onionsupport.com.onionsupport.com
```

La eliminación se verificó tanto en el control plane de Azure como directamente contra los cuatro nameservers autoritativos de Azure DNS.

La zona `onionsupport.com` mantiene un lock `CanNotDelete`.

## 15. Azure Communication Services y Email

Communication Service:

- `onion-acs`
- data location: Europe
- enlazado al dominio de correo de ACS

Email Service:

- `onionsupport-mail`
- data location: Europe

Dominio:

- `mail.onionsupport.com`
- gestión: `CustomerManaged`
- Domain verification: `Verified`
- SPF: `Verified`
- DKIM: `Verified`
- DKIM2: `Verified`

Sender configurado:

- username: `DoNotReply`
- display name: `Onion Support`

No se detectaron sender identities o dominios de prueba sobrantes.

## 16. IAM y principio de mínimo privilegio

### 16.1 Usuarios humanos

La suscripción mantiene dos cuentas Owner:

- operador principal;
- cuenta break-glass.

La elevación temporal `User Access Administrator` a scope `/` fue retirada al finalizar la auditoría IAM.

### 16.2 Managed Identities de Container Apps

Producción `oniontech-aca-zr`:

- `Cost Management Reader` en suscripción
- `Storage Blob Data Contributor` sobre `onionassets`
- `Cosmos DB Built-in Data Contributor` sobre `onionsupport-db-es`

Legacy `oniontech-aca` mantiene temporalmente permisos equivalentes sólo para preservar rollback.

### 16.3 GitHub OIDC

No se usan passwords o certificados persistentes en las App Registrations de CI/CD auditadas.

Las credenciales federadas usan GitHub OIDC y subject inmutable basado en IDs del owner/repository.

Se eliminó el FIC legacy basado únicamente en nombres del repositorio.

Responsabilidades separadas:

| Identidad | Uso | RBAC |
|---|---|---|
| `oniontech-github-deploy` | Deployment backend | `Contributor` limitado a los Container Apps necesarios |
| `chatgpt-onionsupport-audit` | Gateway de auditoría Azure | `Reader` limitado a RGs aprobados |
| `oniontech-factura-audit` | Auditoría de integridad de facturas dentro del ACA productivo | `Container Apps Operator` sólo sobre `oniontech-aca-zr` |

## 17. CI/CD backend

El backend privado usa GitHub Actions y OIDC para Azure.

Variables operativas verificadas:

- Resource Group productivo: `onion-web`
- Container App productivo: `oniontech-aca-zr`

Workflows principales:

- `production.yml`
  - identidad de deploy;
  - construye imagen inmutable;
  - despliega sólo cuando corresponde;
  - tiene provenance gate que rechaza producción automática desde pushes directos que no proceden de un PR mergeado.

- `azure-readonly-audit.yml`
  - identidad Reader dedicada;
  - limita Resource Groups y operaciones permitidas;
  - autenticación OIDC validada end-to-end.

- `factura-integrity-maintenance.yml`
  - identidad `Container Apps Operator` dedicada;
  - ejecuta auditoría de sólo lectura dentro de la réplica productiva mediante `az containerapp exec`;
  - no utiliza la identidad Contributor de deploy.

Un cambio de workflow CI-only no debe requerir nuevo despliegue de imagen. La lógica `production-deploy-impact` clasifica `.github/` como `github-automation` / no-runtime.

## 18. Locks de producción

La auditoría consolidó locks duplicados y dejó **una única protección `CanNotDelete` por recurso crítico**.

Protegidos actualmente:

- `onion-acs`
- alertas Service Health / Resource Health / RestartCount
- `ag-onionsupport-ops`
- `law-onionsupport-prod`
- ACA legacy y ACA ZR
- Managed Environments legacy y ZR
- `onionsupport-db-es`
- Private Endpoints
- Private DNS Zones
- `vnet-onion-prod`
- `onionassets`
- `stoniontechbackup`
- `onion-panel`
- `onionsupport-mail`
- zona DNS `onionsupport.com`

No volver a apilar varios locks `CanNotDelete` sobre el mismo recurso sin una razón operativa explícita.

## 19. Limpieza realizada — septiembre de 2026

Cambios realizados durante la auditoría:

1. inventario completo de Resource Groups y recursos;
2. verificación de ausencia de discos, NICs, Public IPs y snapshots huérfanos;
3. identificación de ACA legacy vs nuevo ACA Zone Redundant;
4. validación de DNS y tráfico de la migración;
5. comparación OLD/ZR de imagen, CPU/RAM, env vars, secrets, registry y RBAC;
6. `oniontech-aca` reducido de `minReplicas=1` a `minReplicas=0`;
7. verificación posterior de 0 réplicas legacy;
8. eliminación de cuatro locks redundantes de Storage/Backup;
9. migración de `containerapp-restarts-onionsupport` desde OLD a ZR;
10. creación del Diagnostic Setting faltante en `onion-aca-env-zr`;
11. validación de Storage, lifecycle, Cosmos, backups y Log Analytics;
12. eliminación del TXT DMARC mal formado;
13. retirada de la elevación `User Access Administrator @ /`;
14. separación de identidad de deploy e identidad Azure Reader;
15. eliminación del FIC OIDC legacy basado en nombre;
16. creación de identidad dedicada `Container Apps Operator` para Factura Audit;
17. validación del destino CI/CD productivo `oniontech-aca-zr`.

## 20. Plan de decommission del ACA legacy

### 20.1 Preconditions

No ejecutar hasta confirmar:

- `api.onionsupport.com` sigue resolviendo exclusivamente al ACA ZR;
- `oniontech-aca-zr` está sano y con réplicas productivas;
- no existen requests recientes al OLD;
- `oniontech-aca` continúa con 0 réplicas;
- el pipeline productivo apunta a `oniontech-aca-zr`;
- la ventana de rollback ha sido cerrada explícitamente.

### 20.2 Orden recomendado

1. capturar snapshot final de configuración OLD;
2. retirar locks `CanNotDelete` únicamente del stack legacy;
3. retirar Contributor del principal de deploy sobre `oniontech-aca`;
4. retirar Azure RBAC de la Managed Identity OLD;
5. retirar Cosmos data-plane role assignment de la Managed Identity OLD;
6. quitar binding de `api.onionsupport.com` del ACA OLD;
7. eliminar managed certificate OLD;
8. eliminar Diagnostic Setting OLD;
9. eliminar `oniontech-aca`;
10. verificar que el Managed Environment OLD está vacío;
11. eliminar `onion-aca-env`;
12. repetir orphan check, locks, IAM y Resource Graph;
13. actualizar este documento y el changelog operativo.

### 20.3 Resultado esperado

Después del decommission deben desaparecer:

- `oniontech-aca`
- `onion-aca-env`
- `mc-onion-aca-env-api-onionsupport-9588`
- identidad gestionada OLD y sus role assignments
- Contributor GitHub sobre OLD
- Diagnostic Setting OLD
- locks OLD

El stack ZR y todos sus recursos administrados deben permanecer intactos.

## 21. Comandos de auditoría seguros

### Inventario

```bash
az graph query -q "
Resources
| project Grupo=resourceGroup, Nombre=name, Tipo=type, Region=location
| order by Grupo asc, Tipo asc, Nombre asc
" --query data -o table
```

### Orphan check

```bash
az graph query -q "
Resources
| where type =~ 'microsoft.compute/disks'
| where isempty(managedBy)
| project Grupo=resourceGroup,Nombre=name
" --query data -o table

az graph query -q "
Resources
| where type =~ 'microsoft.network/networkinterfaces'
| where isempty(properties.virtualMachine.id)
| where isempty(properties.privateEndpoint.id)
| project Grupo=resourceGroup,Nombre=name
" --query data -o table
```

### Container Apps

```bash
az containerapp list -g onion-web \
  --query "[].{App:name,Estado:properties.runningStatus,Min:properties.template.scale.minReplicas,Max:properties.template.scale.maxReplicas,FQDN:properties.configuration.ingress.fqdn}" \
  -o table
```

### Locks

```bash
az lock list \
  --query "[].{Nombre:name,Nivel:level,Notas:notes,Id:id}" \
  -o table
```

### IAM

```bash
az role assignment list \
  --all \
  --query "[].{Principal:principalName,Tipo:principalType,Rol:roleDefinitionName,Scope:scope}" \
  -o table
```

## 22. Principios operativos

1. **No borrar por nombre.** Verificar dependencias, tráfico, DNS, métricas y RBAC antes de eliminar.
2. **Producción se protege con locks, no con duplicación de locks.** Una protección clara por recurso crítico.
3. **OIDC antes que secretos persistentes.** CI/CD no debe depender de client secrets de larga duración.
4. **Una identidad por responsabilidad.** Deploy, auditoría general y auditoría de facturas tienen permisos distintos.
5. **Private Endpoint donde los datos lo requieren.** Cosmos y Blob privados deben seguir integrados con VNet y Private DNS.
6. **Observabilidad no se elimina para ahorrar céntimos.** Log Analytics y Diagnostic Settings actuales tienen uso demostrado.
7. **Los recursos administrados por Azure no se limpian manualmente.** Especialmente el RG `ME_...` de Container Apps.
8. **Rollback debe tener fecha de caducidad.** El stack legacy existe temporalmente y debe retirarse después de cerrar la ventana de seguridad.
9. **Documentar después de cada cambio estructural.** Este archivo debe reflejar el estado real de Azure, no una intención histórica.

## 23. Próximas acciones

- [ ] Cerrar formalmente la ventana de rollback del ACA legacy.
- [ ] Ejecutar el decommission siguiendo la sección 20.
- [ ] Repetir Resource Graph + orphan check + IAM después del decommission.
- [ ] Actualizar este documento eliminando el bloque legacy.
- [ ] Revisar periódicamente costes, daily quota de logs y capacidad de Storage.

---

**Estado de la auditoría:** infraestructura productiva validada y limpia; único residuo deliberado: stack ACA legacy conservado temporalmente como rollback.
