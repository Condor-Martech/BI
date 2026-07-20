# Admin Tools — Reset Password & User Impersonation

**Fecha**: 2026-07-20
**Autor**: Héctor Velásquez (`hector.velasques@condor.com.br`)
**Estado**: Diseño aprobado, pendiente plan de implementación

## Objetivo

Exponer dos herramientas de soporte para el super admin y una lista corta de usuarios de confianza:

1. **Reset de contraseña por API**: reproducir el comportamiento del script `app/scripts/reset-password.mjs` pero desde la UI, devolviendo la contraseña generada en la respuesta HTTP para entregarla al usuario final por otro canal.
2. **Impersonar a un usuario**: iniciar una sesión temporal como otro usuario para ver los mismos reportes, workspaces y permisos que él ve. Volver a la sesión original en un click, sin re-login.

Ambas operaciones son sensibles. El acceso se controla vía **allowlist en base de datos**, gestionada exclusivamente por un **super admin** definido por variable de entorno.

## No-goals

- No hay envío de email al hacer reset (el super admin transmite la contraseña por otro canal).
- No hay rate limiting propio (allowlist es suficiente barrera). Se puede agregar después con `@nestjs/throttler`.
- No hay UI para gestionar el `SUPER_ADMIN_EMAIL` — se cambia con redeploy.
- No hay auditoría de "qué hizo el admin mientras impersonaba" — solo se loguea el inicio de la impersonación (el fin ocurre en el BFF, ver sección Auditoría).
- No hay soporte para impersonation anidada (un admin impersonando a otro admin que impersona a un tercero). Si hay una impersonación activa, un nuevo `POST /impersonate` la sobreescribe.

## Arquitectura

### Niveles de acceso

| Nivel | Se define por | Puede hacer |
|-------|---------------|-------------|
| **Super admin** | Env var `SUPER_ADMIN_EMAIL` (single email) | Reset + impersonate + CRUD de allowlist |
| **Allowlist** | Campo `isAdminAllowlist: boolean` en `User` (default `false`) | Reset + impersonate. No puede tocar la allowlist |
| **Todo el resto** | — | Nada de esto |

El super admin es implícitamente parte de la allowlist (no hace falta setearle el flag).

### Componentes nuevos

**Backend (`app/`)**

- `User.isAdminAllowlist: boolean` — campo nuevo en `user.entity.ts`, indexado.
- `AdminAllowlistGuard` — nuevo guard en `app/src/app/core/auth/admin-allowlist.guard.ts`. Valida que `req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() || req.user.isAdminAllowlist === true`. Normalización a lowercase para evitar mismatch por casing.
- `SuperAdminGuard` — nuevo guard en `app/src/app/core/auth/super-admin.guard.ts`. Valida `req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()`.
- `UsersService.adminResetPassword(email, length?)` — nuevo método. Genera password, hashea, updatea, **no envía email**, devuelve plaintext.
- `UsersService.adminGenerateImpersonationToken(targetEmail)` — nuevo método. Busca el user objetivo, firma un JWT con TTL corto (1h) usando el mismo `Authenticator.generate()`, devuelve `{ token, exp, target: { email, name, role } }`.
- `UsersService.allowlistList()`, `allowlistAdd(email)`, `allowlistRemove(email)` — CRUD del flag.
- 5 endpoints nuevos en `UsersController` bajo el prefijo `/users/admin`.
- `AuditLog` entries en cada acción sensible.

**Frontend (`web-next/`)**

- Cookie nueva `bi_admin_token` — guarda el JWT del super admin/allowlist mientras hay impersonation activa.
- BFF routes:
  - `POST /api/admin/reset-password` — proxy 1:1.
  - `POST /api/admin/impersonate` — proxy + swap de cookies.
  - `POST /api/admin/impersonate/stop` — restaura la cookie original (no toca backend).
  - `GET /api/admin/allowlist`, `POST /api/admin/allowlist`, `DELETE /api/admin/allowlist/:email` — proxies 1:1.
- Páginas nuevas:
  - `app/(dashboard)/admin/reset-password/page.tsx`
  - `app/(dashboard)/admin/impersonate/page.tsx`
  - `app/(dashboard)/admin/allowlist/page.tsx` (super admin only)
- Componente `<ImpersonationBanner />` en el layout — visible solo si existe `bi_admin_token`.
- Items nuevos en el sidebar, con visibilidad por rol/flag.

## Feature 1 — Reset password

### Backend

**Endpoint**

```
POST /users/admin/reset-password
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "email": "target@condor.com.br",
  "length": 12  // opcional, default 12
}
```

**Guards**: `JwtAuthGuard` (global) + `AdminAllowlistGuard`.

**Response 200**

```json
{
  "email": "target@condor.com.br",
  "password": "aBc123XyZ456",
  "resetAt": "2026-07-20T18:00:00.000Z"
}
```

**Response headers**

```
Cache-Control: no-store
Pragma: no-cache
```

**Errores**
- `403` si el actor no está en allowlist ni es super admin.
- `404` si el `email` objetivo no existe en `users`.
- `400` si `length < 8 || length > 64`.

**Método de servicio**

```ts
async adminResetPassword(email: string, length = 12): Promise<AdminResetResult> {
  const user = await this.userModel.findOne({ email });
  if (!user) throw new NotFoundException(`Usuário não encontrado: ${email}`);

  const password = this.hashManager.generatePassword(length);
  const passwordHash = await this.hashManager.hash(password);

  await this.userModel.updateOne(
    { _id: user._id },
    { $set: { password: passwordHash }, $currentDate: { lastModified: true } }
  );

  return { email, password, resetAt: new Date() };
}
```

**Audit log**: `{ actor: actorEmail, target: email, action: 'admin_reset_password', at: Date }`.

### Frontend

**Página** `/admin/reset-password`

- El JWT no lleva `isAdminAllowlist` (para no invalidar tokens al toggle). El gate server-side de la page llama `GET /api/admin/allowlist/me` — si `allowed === false` → `notFound()`.
- UI: input email + input length + botón "Resetar contraseña".
- Respuesta: caja con la password en `<code>`, botón "Copiar", advertencia "Esta contraseña no se vuelve a ver".

**BFF route** `app/api/admin/reset-password/route.ts`

Delega en `lib/api/proxy.ts` — proxy 1:1 al backend.

### Sidebar

Ítem "Reset password" bajo un nuevo grupo "Herramientas admin" — visible si `allowed === true` en `GET /api/admin/allowlist/me`.

## Feature 2 — Impersonation

### Backend

**Endpoint start**

```
POST /users/admin/impersonate
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{ "email": "target@condor.com.br" }
```

**Guards**: `JwtAuthGuard` + `AdminAllowlistGuard`.

**Response 200**

```json
{
  "token": "eyJhbGc...",
  "exp": 1721502000,
  "target": {
    "email": "target@condor.com.br",
    "name": "Fulano",
    "role": "user"
  }
}
```

**Errores**
- `403` si el actor no está autorizado.
- `404` si el `email` objetivo no existe.
- `400` si el actor intenta impersonarse a sí mismo.

**Método de servicio**

```ts
async adminGenerateImpersonationToken(targetEmail: string): Promise<ImpersonationTokenResult> {
  const target = await this.userModel.findOne({ email: targetEmail });
  if (!target) throw new NotFoundException(`Usuário não encontrado: ${targetEmail}`);

  const IMPERSONATION_TTL = '1h';
  const token = this.authenticator.generate(
    {
      id: String(target._id),
      email: target.email,
      role: target.role,
      name: target.name,
    },
    IMPERSONATION_TTL
  );

  const decoded = this.authenticator.getTokenData(`Bearer ${token}`);
  return { token, exp: decoded.exp, target: { email: target.email, name: target.name, role: target.role } };
}
```

**Cambio en `Authenticator.generate`**

Aceptar un segundo argumento opcional `expiresIn?: string`. Si no viene, usa `process.env.JWT_EXPIRES_IN || '20h'`. Cambio no-breaking.

**Audit log**: `{ actor: actorEmail, target: targetEmail, action: 'impersonate_start', at: Date }`.

**Sin endpoint stop en backend**. El "salir de la impersonación" es una operación del BFF sobre cookies — el backend no lo sabe. Igual se puede loguear en el BFF (opcional, no es prioritario).

### Frontend

**Cookies**

| Nombre | Contenido | Cuándo se setea | Cuándo se borra |
|--------|-----------|-----------------|-----------------|
| `bi_token` | JWT del admin (default) o del target (durante impersonación) | Login normal / al iniciar impersonation | Logout / al parar impersonation, se restaura al del admin |
| `bi_admin_token` | JWT del admin, guardado al iniciar impersonation | `POST /api/admin/impersonate` | `POST /api/admin/impersonate/stop`, logout, o su propio exp |

Ambas cookies con las mismas opciones: `httpOnly`, `sameSite: lax`, `secure` en prod, `path: /`.
`maxAge` de cada una se calcula a partir del `exp` del JWT correspondiente.

**BFF routes**

`app/api/admin/impersonate/route.ts` (POST):

1. Lee `bi_token` (admin JWT).
2. Llama al backend `POST /users/admin/impersonate` con el body del cliente.
3. Setea `bi_admin_token` con el valor actual de `bi_token`.
4. Reemplaza `bi_token` con el `token` del response del backend.
5. Devuelve `{ target }` al cliente (no el token, no hace falta).

`app/api/admin/impersonate/stop/route.ts` (POST):

1. Lee `bi_admin_token`. Si no existe → 400 "no hay impersonación activa".
2. Setea `bi_token` con el valor de `bi_admin_token`.
3. Borra `bi_admin_token`.
4. Devuelve `{ ok: true }`.

Si el JWT admin en `bi_admin_token` ya venció al momento de parar → borra ambas cookies y devuelve `{ ok: true, expired: true }`. El cliente redirecciona a `/login`.

**Página** `/admin/impersonate`

- Server-side gate igual que reset-password (allowed via `/api/admin/allowlist/me`).
- Buscador de usuarios: input con debounce, autocomplete sobre `GET /users?search=...` (endpoint existente).
- Cada resultado tiene botón "Ver como este usuario".
- Click → `POST /api/admin/impersonate` → redirect a `/`.

**Banner de impersonación**

Componente `<ImpersonationBanner />` en `app/(dashboard)/layout.tsx`:

- Server component. Lee cookie `bi_admin_token`.
- Si existe: renderiza banner rojo pegado arriba del layout (fixed, `z-50`), texto "Viendo como **{targetName}** — [Volver a mi sesión]".
- El botón "Volver" es un `<form action={stopImpersonation}>` con server action. El server action hace inline lo mismo que el route handler `POST /api/admin/impersonate/stop` (swap de cookies vía `cookies()` de Next), luego `revalidatePath('/')`. El route handler existe igual para que el `SessionExpiryBanner` client-side pueda invocarlo sin server action.
- El `getSession()` existente sigue leyendo `bi_token` — resolverá al target user naturalmente. Todos los datos que se muestran son los del target.

**Interacción con `SessionExpiryBanner`**

Ya existe un banner que avisa 5 min antes del exp del JWT. Durante impersonation, el `bi_token` tiene TTL 1h, así que el banner puede aparecer temprano. Aceptable — cuando expire, redirect a `/login`, pero **antes de redirigir**, si hay `bi_admin_token`, se debe intentar restaurar la sesión admin en vez de mandar a login. Implementación: interceptor en el mismo banner que hace `POST /api/admin/impersonate/stop` primero, si `expired: false` navega a `/`, si no, va a `/login`.

## Feature 3 — Allowlist en DB

### Modelo

Añadir a `app/src/app/modules/users/user.entity.ts`:

```ts
@Prop({ type: Boolean, default: false, index: true })
isAdminAllowlist: boolean;
```

No hace falta migración explícita — MongoDB tolera el campo ausente en documentos viejos, y la lectura devuelve `undefined` que se trata como `false` en el guard.

### Backend

**Endpoints**

```
GET    /users/admin/allowlist              → lista users con flag=true
POST   /users/admin/allowlist              → { email } marca flag=true
DELETE /users/admin/allowlist/:email       → marca flag=false
GET    /users/admin/allowlist/me           → { allowed: boolean }
```

**Guards**:
- Los 3 primeros: `JwtAuthGuard` + `SuperAdminGuard`.
- El último (`/me`): `JwtAuthGuard` + `AdminAllowlistGuard`. Devuelve simplemente `{ allowed: true }` — el guard ya validó. Sirve para que el frontend sepa si mostrar los items del sidebar.

**Respuestas**

`GET /users/admin/allowlist`
```json
{
  "items": [
    { "id": "6567...", "email": "...", "name": "...", "role": "admin", "addedAt": null }
  ]
}
```
`addedAt: null` porque no estamos guardando cuándo se activó el flag. Si más adelante se quiere auditoría de la propia lista, agregar campo `adminAllowlistSince: Date` — no lo agregamos ahora (YAGNI).

`POST /users/admin/allowlist { email }`
- Busca user por email. Si no existe → `404` "usuario no encontrado, créelo primero".
- Setea `isAdminAllowlist: true`. Idempotente.
- Devuelve el user actualizado.
- Audit: `{ actor: actorEmail, target: email, action: 'allowlist_add', at: Date }`.

`DELETE /users/admin/allowlist/:email`
- Setea `isAdminAllowlist: false`. Idempotente.
- **Rechaza** si `email === SUPER_ADMIN_EMAIL` → `400` "no se puede quitar al super admin" (el super admin no depende del flag, pero por claridad rechazamos la operación).
- Audit: `{ actor, target, action: 'allowlist_remove', at }`.

### Frontend

**Página** `/admin/allowlist` (super admin only)

- Server-side gate: si `session.email !== process.env.SUPER_ADMIN_EMAIL` → `notFound()`.
  - Nota: en el server component se lee la env var directo. La misma env var vive en `app/` — la duplicamos en la env de `web-next` como `SUPER_ADMIN_EMAIL` (server-only, no expuesta al cliente).
- Tabla con columnas: Email, Nombre, Rol, [Quitar acceso].
- Botón arriba "Añadir usuario" → modal con:
  - Input de email con autocomplete sobre `GET /users?search=...` (mismo componente que impersonate).
  - Si el email no matchea ningún user, botón se deshabilita con mensaje "el email debe existir en users".
- Confirmación antes de quitar acceso.

**Sidebar**

- Grupo "Herramientas admin", visible si `GET /api/admin/allowlist/me` devuelve `allowed: true`:
  - "Reset password"
  - "Ver como usuario"
- Ítem "Gestión de accesos admin" — visible solo si `session.email === SUPER_ADMIN_EMAIL`.

## Env vars

**Backend** — añadir a `app/src/app.config.ts` `REQUIRED_ENV_VARS`:

```
SUPER_ADMIN_EMAIL=hector.velasques@condor.com.br
```

Añadir a `app.env.example`:

```bash
# Email of the single super admin. Manages the admin allowlist and can use
# admin tools (reset password, impersonate) unconditionally.
SUPER_ADMIN_EMAIL=
```

**Frontend** — añadir a la env de `web-next`:

```
SUPER_ADMIN_EMAIL=hector.velasques@condor.com.br
```

Usado solo en server components para gate de `/admin/allowlist`. Nunca en cliente. **No prefijar con `NEXT_PUBLIC_`**.

## Auditoría

Todas las acciones sensibles pasan por `AuditLog`:

| Acción | Actor | Target | Payload extra |
|--------|-------|--------|---------------|
| `admin_reset_password` | actor email | target email | — |
| `impersonate_start` | actor email | target email | JWT exp |
| `allowlist_add` | actor email | target email | — |
| `allowlist_remove` | actor email | target email | — |

`impersonate_stop` no se loguea (es una operación del BFF, el backend no lo sabe). Si más adelante interesa, se puede añadir un endpoint `POST /users/admin/impersonate/stop` que solo loguea.

## Riesgos y mitigaciones

1. **Password en response HTTP** — mitigación: `Cache-Control: no-store`, audit log. Toleramos porque el script CLI existente ya expone la password igual (por stdout).
2. **JWT de impersonation con rol del target** — un admin que impersona a un manager gana temporalmente sus permisos. Es la idea. Documentado.
3. **`bi_admin_token` persistente** — si el admin cierra el navegador con impersonación activa, la cookie sigue viva hasta el exp del JWT admin. Mitigación: `httpOnly` + `sameSite: lax` + `secure` en prod. Al reabrir, banner sigue visible y puede volver.
4. **JWT admin vencido al querer volver** — el flow del BFF stop detecta y devuelve `{ expired: true }`, el cliente va a `/login`.
5. **Impersonar al super admin desde una allowlist** — permitido. El flag `isAdminAllowlist=false` del super admin en DB no cambia nada (el guard lo aprueba por email). Si querés bloquear que un allowlisted impersone al super admin, agregar check en el service. Decisión actual: **permitirlo** (la allowlist es gente de confianza, si querés más granularidad usá roles y sacale el flag).
6. **`isAdminAllowlist` no está en el JWT** — cambios en la lista no invalidan tokens. Contra: si te quitan el flag, seguís pudiendo entrar hasta que expire el token. Mitigación: los guards leen `req.user` desde DB en cada request (ya lo hace `JwtAuthGuard.validateTokenAndGetUser`). Verificar que ese método incluye el campo `isAdminAllowlist` (debería, porque devuelve el user document completo).

## Testing

Tests unitarios (Jest, `app/`):

- `AdminAllowlistGuard` — pasa para super admin, pasa para allowlist=true, falla para allowlist=false y no super admin.
- `SuperAdminGuard` — solo pasa para super admin.
- `UsersService.adminResetPassword` — genera password del length correcto, hashea con bcrypt, actualiza `lastModified`, no dispara mail.
- `UsersService.adminGenerateImpersonationToken` — firma JWT con payload del target, TTL 1h, rechaza target inexistente.
- `UsersService.allowlist*` — add/remove idempotentes, add rechaza email inexistente, remove rechaza super admin.

Sin tests en `web-next/` (el proyecto no tiene test suite).

## Fuera del scope de esta spec

- UI para ver el `AuditLog` de operaciones admin. Los logs quedan en la colección, se pueden ver desde Mongo o desde Bull Board si están en jobs.
- Rate limiting.
- Notificación al target user cuando alguien impersona su sesión.
- Rollback automático del JWT de impersonation en caso de logout del target durante impersonation.
