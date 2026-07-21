# Admin Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 3 admin features — reset password from UI, impersonate any user, and DB-backed allowlist managed by a single super admin — with audit logging and short-TTL impersonation tokens.

**Architecture:** Backend NestJS gets 2 new guards (`SuperAdminGuard`, `AdminAllowlistGuard`), 1 new field on `User` (`isAdminAllowlist`), 6 new endpoints under `/users/admin/*`, and a small extension of `Authenticator.generate` to accept a custom TTL. Frontend Next.js BFF swaps cookies for impersonation (`bi_token` ↔ `bi_admin_token`), and 3 new dashboard pages gate their access via `GET /users/admin/allowlist/me`.

**Tech Stack:** NestJS 9 + MongoDB (Mongoose) + `jsonwebtoken` + `bcryptjs` (backend) · Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn (frontend) · Jest for backend unit tests.

**Design spec:** `docs/superpowers/specs/2026-07-20-admin-tools-design.md` (commit `717d865`).

**Reference:** See `CLAUDE.md`, `app/CLAUDE.md`, and `web-next/CLAUDE.md` for repo conventions.

---

## File map

**Backend — create:**
- `app/src/app/core/auth/super-admin.guard.ts`
- `app/src/app/core/auth/admin-allowlist.guard.ts`
- `app/tests/admin-guards.spec.ts`
- `app/tests/users-admin.spec.ts`

**Backend — modify:**
- `app/src/app.config.ts` — add `SUPER_ADMIN_EMAIL` to `REQUIRED_ENV_VARS`
- `app/src/app/core/utils/authenticator.ts` — add optional `expiresIn` param to `generate()`
- `app/src/app/modules/users/user.entity.ts` — add `isAdminAllowlist: boolean`
- `app/src/app/modules/users/users.service.ts` — add 5 new methods
- `app/src/app/modules/users/users.controller.ts` — add 6 new endpoints
- `app/src/app/modules/users/users.module.ts` — verify `AuditLogModule` is available (likely already is via global)
- `app/src/app/modules/audit-log/audit-log.constants.ts` — add 4 new action constants
- `app.env.example` — document `SUPER_ADMIN_EMAIL`

**Frontend — create:**
- `web-next/app/api/admin/reset-password/route.ts`
- `web-next/app/api/admin/impersonate/route.ts`
- `web-next/app/api/admin/impersonate/stop/route.ts`
- `web-next/app/api/admin/allowlist/[[...path]]/route.ts`
- `web-next/lib/auth/admin.ts` — helper `isSuperAdmin()`, `isAllowedAdmin()`
- `web-next/app/(dashboard)/admin/reset-password/page.tsx`
- `web-next/app/(dashboard)/admin/reset-password/_components/reset-form.tsx`
- `web-next/app/(dashboard)/admin/impersonate/page.tsx`
- `web-next/app/(dashboard)/admin/impersonate/_components/user-search.tsx`
- `web-next/app/(dashboard)/admin/allowlist/page.tsx`
- `web-next/app/(dashboard)/admin/allowlist/_components/allowlist-table.tsx`
- `web-next/app/(dashboard)/_components/impersonation-banner.tsx`
- `web-next/app/(dashboard)/_components/impersonation-stop-action.ts` (server action)

**Frontend — modify:**
- `web-next/app/(dashboard)/layout.tsx` — mount `<ImpersonationBanner />`
- `web-next/app/(dashboard)/_components/sidebar.tsx` — add conditional "Herramientas admin" group
- `.env.example` (or `web-next/.env.example` if exists) — document `SUPER_ADMIN_EMAIL`

---

## Backend Phase — Config, entity, guards

### Task 1: Add `SUPER_ADMIN_EMAIL` env var + audit constants

**Files:**
- Modify: `app/src/app.config.ts`
- Modify: `app/src/app/modules/audit-log/audit-log.constants.ts`
- Modify: `app.env.example`

- [ ] **Step 1: Add env var to `REQUIRED_ENV_VARS`**

Open `app/src/app.config.ts`. Find the `REQUIRED_ENV_VARS` array (around lines 20-34). Add `"SUPER_ADMIN_EMAIL"` at the end.

```ts
const REQUIRED_ENV_VARS = [
  "MONGO_DSN",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "POWER_BI_BASE_URL",
  "AZURE_URL",
  "AZURE_CLIENT_SECRET",
  "REDIS_HOST",
  "REDIS_PORT",
  "BASE_URL",
  "EMAIL_API_URL",
  "BULL_BOARD_USER",
  "BULL_BOARD_PASS",
  "SUPER_ADMIN_EMAIL",
];
```

- [ ] **Step 2: Document env var in `app.env.example`**

Open `app.env.example`. Add at the end (or near other identity-related vars):

```bash
# Email of the single super admin. Manages the admin allowlist and can use
# admin tools (reset password, impersonate) unconditionally.
SUPER_ADMIN_EMAIL=
```

- [ ] **Step 3: Add audit constants**

Open `app/src/app/modules/audit-log/audit-log.constants.ts`. Find the `AUDIT_ACTIONS` object. Add 4 new entries:

```ts
export const AUDIT_ACTIONS = {
  // ...existing entries above...
  USER_PASSWORD_RESET_BY_ADMIN: 'user.password_reset_by_admin',
  USER_IMPERSONATED: 'user.impersonated',
  ADMIN_ALLOWLIST_ADDED: 'admin.allowlist_added',
  ADMIN_ALLOWLIST_REMOVED: 'admin.allowlist_removed',
} as const;
```

- [ ] **Step 4: Commit**

```bash
git add app/src/app.config.ts app.env.example app/src/app/modules/audit-log/audit-log.constants.ts
git commit -m "feat(admin): add SUPER_ADMIN_EMAIL env var and audit action constants"
```

---

### Task 2: Add `isAdminAllowlist` field to User entity

**Files:**
- Modify: `app/src/app/modules/users/user.entity.ts`

- [ ] **Step 1: Add prop to schema**

Open `app/src/app/modules/users/user.entity.ts`. Find the `@Schema` decorated class (around line 4). Add before the closing brace:

```ts
@Prop({ type: Boolean, default: false, index: true })
isAdminAllowlist: boolean;
```

- [ ] **Step 2: Verify no other file needs update**

Run: `rg "isAdminAllowlist" app/src` — expected: only shows the entity file. If it shows the DTOs, that's fine (leave them alone; this field is internal, never returned via public DTOs).

- [ ] **Step 3: Commit**

```bash
git add app/src/app/modules/users/user.entity.ts
git commit -m "feat(users): add isAdminAllowlist flag on User entity"
```

---

### Task 3: `SuperAdminGuard` with tests

**Files:**
- Create: `app/src/app/core/auth/super-admin.guard.ts`
- Create: `app/tests/admin-guards.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/admin-guards.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from '../src/app/core/auth/super-admin.guard';

function mockContext(user: { email?: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const original = process.env.SUPER_ADMIN_EMAIL;
  beforeAll(() => { process.env.SUPER_ADMIN_EMAIL = 'admin@condor.com.br'; });
  afterAll(() => { process.env.SUPER_ADMIN_EMAIL = original; });

  const guard = new SuperAdminGuard();

  it('allows the super admin', () => {
    expect(guard.canActivate(mockContext({ email: 'admin@condor.com.br' }))).toBe(true);
  });

  it('normalizes email casing', () => {
    expect(guard.canActivate(mockContext({ email: 'ADMIN@condor.com.br' }))).toBe(true);
  });

  it('rejects a non-super-admin user', () => {
    expect(() => guard.canActivate(mockContext({ email: 'other@condor.com.br' }))).toThrow();
  });

  it('rejects when user is missing', () => {
    expect(() => guard.canActivate(mockContext(undefined))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- admin-guards.spec.ts`
Expected: FAIL — `Cannot find module '../src/app/core/auth/super-admin.guard'`

- [ ] **Step 3: Implement `SuperAdminGuard`**

Create `app/src/app/core/auth/super-admin.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }
    if (!superAdminEmail) {
      throw new ForbiddenException('SUPER_ADMIN_EMAIL não configurado');
    }
    if (String(user.email).toLowerCase().trim() !== superAdminEmail) {
      throw new ForbiddenException('Apenas o super admin pode executar esta ação');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- admin-guards.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/core/auth/super-admin.guard.ts app/tests/admin-guards.spec.ts
git commit -m "feat(auth): add SuperAdminGuard for super-admin-only endpoints"
```

---

### Task 4: `AdminAllowlistGuard` with tests

**Files:**
- Create: `app/src/app/core/auth/admin-allowlist.guard.ts`
- Modify: `app/tests/admin-guards.spec.ts`

- [ ] **Step 1: Add tests**

Append to `app/tests/admin-guards.spec.ts`:

```ts
import { AdminAllowlistGuard } from '../src/app/core/auth/admin-allowlist.guard';

describe('AdminAllowlistGuard', () => {
  const original = process.env.SUPER_ADMIN_EMAIL;
  beforeAll(() => { process.env.SUPER_ADMIN_EMAIL = 'admin@condor.com.br'; });
  afterAll(() => { process.env.SUPER_ADMIN_EMAIL = original; });

  const guard = new AdminAllowlistGuard();

  function ctx(user: any) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  it('allows the super admin regardless of isAdminAllowlist flag', () => {
    expect(guard.canActivate(ctx({ email: 'admin@condor.com.br', isAdminAllowlist: false }))).toBe(true);
  });

  it('allows a user with isAdminAllowlist=true', () => {
    expect(guard.canActivate(ctx({ email: 'someone@condor.com.br', isAdminAllowlist: true }))).toBe(true);
  });

  it('rejects a user without the flag', () => {
    expect(() => guard.canActivate(ctx({ email: 'someone@condor.com.br', isAdminAllowlist: false }))).toThrow();
  });

  it('rejects a user with flag undefined', () => {
    expect(() => guard.canActivate(ctx({ email: 'someone@condor.com.br' }))).toThrow();
  });

  it('rejects when user is missing', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- admin-guards.spec.ts`
Expected: FAIL — `Cannot find module '../src/app/core/auth/admin-allowlist.guard'`

- [ ] **Step 3: Implement `AdminAllowlistGuard`**

Create `app/src/app/core/auth/admin-allowlist.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }

    const emailNormalized = String(user.email).toLowerCase().trim();
    if (superAdminEmail && emailNormalized === superAdminEmail) return true;
    if (user.isAdminAllowlist === true) return true;

    throw new ForbiddenException('Você não está autorizado a usar ferramentas de admin');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- admin-guards.spec.ts`
Expected: PASS — 9 tests total (4 SuperAdmin + 5 Allowlist).

- [ ] **Step 5: Commit**

```bash
git add app/src/app/core/auth/admin-allowlist.guard.ts app/tests/admin-guards.spec.ts
git commit -m "feat(auth): add AdminAllowlistGuard combining super admin + isAdminAllowlist"
```

---

### Task 5: Extend `Authenticator.generate()` with optional TTL

**Files:**
- Modify: `app/src/app/core/utils/authenticator.ts`
- Create: `app/tests/authenticator.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/authenticator.spec.ts`:

```ts
import { Authenticator } from '../src/app/core/utils/authenticator';
import * as jwt from 'jsonwebtoken';

describe('Authenticator.generate', () => {
  const original = { secret: process.env.JWT_SECRET, exp: process.env.JWT_EXPIRES_IN };
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '20h';
  });
  afterAll(() => {
    process.env.JWT_SECRET = original.secret;
    process.env.JWT_EXPIRES_IN = original.exp;
  });

  const auth = new Authenticator({} as any);

  it('uses JWT_EXPIRES_IN env when no expiresIn is passed', () => {
    const token = auth.generate({ id: 'u1', email: 'a@b.c', role: 'user' });
    const decoded = jwt.verify(token, 'test-secret') as any;
    const secondsInToken = decoded.exp - decoded.iat;
    expect(secondsInToken).toBe(20 * 60 * 60);
  });

  it('honors custom expiresIn when passed', () => {
    const token = auth.generate({ id: 'u1', email: 'a@b.c', role: 'user' }, '1h');
    const decoded = jwt.verify(token, 'test-secret') as any;
    const secondsInToken = decoded.exp - decoded.iat;
    expect(secondsInToken).toBe(60 * 60);
  });

  it('signs the given payload', () => {
    const token = auth.generate({ id: 'u1', email: 'a@b.c', role: 'admin', name: 'Alice' });
    const decoded = jwt.verify(token, 'test-secret') as any;
    expect(decoded.id).toBe('u1');
    expect(decoded.email).toBe('a@b.c');
    expect(decoded.role).toBe('admin');
    expect(decoded.name).toBe('Alice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- authenticator.spec.ts`
Expected: FAIL — the second test fails because `generate` ignores the second arg.

- [ ] **Step 3: Add the optional param to `generate()`**

Open `app/src/app/core/utils/authenticator.ts`. Find the `generate` method (around lines 46-51). Replace with:

```ts
public generate(input: authenticationData, expiresIn?: string): string {
  const ttl = expiresIn || process.env.JWT_EXPIRES_IN || '20h';
  const token = jwt.sign(input, process.env.JWT_SECRET as string, {
    expiresIn: ttl,
  });
  return token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- authenticator.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/core/utils/authenticator.ts app/tests/authenticator.spec.ts
git commit -m "feat(auth): allow Authenticator.generate to accept custom expiresIn"
```

---

## Backend Phase — Feature 1: Reset password

### Task 6: `UsersService.adminResetPassword` with tests

**Files:**
- Modify: `app/src/app/modules/users/users.service.ts`
- Create: `app/tests/users-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `app/tests/users-admin.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from '../src/app/modules/users/users.service';
import { User } from '../src/app/modules/users/user.entity';
import { Account } from '../src/app/modules/accounts/account.entity';
import { Filter } from '../src/app/modules/filters/filter.entity';
import { Report } from '../src/app/modules/reports/report.entity';
import { Group } from '../src/app/modules/groups/group.entity';
import { UserGroups } from '../src/app/modules/user-groups/user-groups.entity';
import { SendMailResetProducer } from '../src/app/core/jobs/sendMailReset-producer';
import { SendMailWelcomeProducer } from '../src/app/core/jobs/sendMailWelcome-producer';
import { Authenticator } from '../src/app/core/utils/authenticator';
import { AccountsService } from '../src/app/modules/accounts/accounts.service';
import { LoginLogService } from '../src/app/modules/login-log/login-log.service';
import { HashManager } from '../src/app/core/utils/hash.manager';

describe('UsersService — admin operations', () => {
  let service: UsersService;
  const userModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  };
  const hashManager = { hash: jest.fn(), generatePassword: jest.fn() };
  const authenticator = { generate: jest.fn(), getTokenData: jest.fn() };
  const sendMailReset = { sendMailResetPass: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Account.name), useValue: {} },
        { provide: getModelToken(Filter.name), useValue: {} },
        { provide: getModelToken(Report.name), useValue: {} },
        { provide: getModelToken(Group.name), useValue: {} },
        { provide: getModelToken(UserGroups.name), useValue: {} },
        { provide: SendMailResetProducer, useValue: sendMailReset },
        { provide: SendMailWelcomeProducer, useValue: {} },
        { provide: Authenticator, useValue: authenticator },
        { provide: AccountsService, useValue: {} },
        { provide: LoginLogService, useValue: {} },
        { provide: HashManager, useValue: hashManager },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('adminResetPassword', () => {
    it('generates a new password, hashes and updates without sending mail', async () => {
      userModel.findOne.mockResolvedValue({ _id: 'u1', email: 'target@x.com' });
      hashManager.generatePassword.mockReturnValue('newPass1234');
      hashManager.hash.mockResolvedValue('hashed');
      userModel.updateOne.mockResolvedValue({ acknowledged: true });

      const result = await service.adminResetPassword('target@x.com', 12);

      expect(hashManager.generatePassword).toHaveBeenCalledWith(12);
      expect(hashManager.hash).toHaveBeenCalledWith('newPass1234');
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { password: 'hashed' }, $currentDate: { lastModified: true } }
      );
      expect(sendMailReset.sendMailResetPass).not.toHaveBeenCalled();
      expect(result.email).toBe('target@x.com');
      expect(result.password).toBe('newPass1234');
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException if user does not exist', async () => {
      userModel.findOne.mockResolvedValue(null);
      await expect(service.adminResetPassword('missing@x.com')).rejects.toThrow(NotFoundException);
    });

    it('uses default length 12 when not provided', async () => {
      userModel.findOne.mockResolvedValue({ _id: 'u1', email: 'target@x.com' });
      hashManager.generatePassword.mockReturnValue('xxxxxxxxxxxx');
      hashManager.hash.mockResolvedValue('h');
      userModel.updateOne.mockResolvedValue({});
      await service.adminResetPassword('target@x.com');
      expect(hashManager.generatePassword).toHaveBeenCalledWith(12);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: FAIL — `service.adminResetPassword is not a function`.

- [ ] **Step 3: Implement `adminResetPassword`**

Open `app/src/app/modules/users/users.service.ts`. At the top, ensure `NotFoundException` is imported from `@nestjs/common`. Add this method near the existing `updatePass` (around line 497):

```ts
async adminResetPassword(email: string, length = 12): Promise<{ email: string; password: string; resetAt: Date }> {
  const user = await this.userModel.findOne({ email });
  if (!user) {
    throw new NotFoundException(`Usuário não encontrado: ${email}`);
  }
  const password = this.hashManager.generatePassword(length);
  const passwordHash = await this.hashManager.hash(password);
  await this.userModel.updateOne(
    { _id: user._id },
    { $set: { password: passwordHash }, $currentDate: { lastModified: true } },
  );
  return { email, password, resetAt: new Date() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/modules/users/users.service.ts app/tests/users-admin.spec.ts
git commit -m "feat(users): add adminResetPassword service method (no email dispatch)"
```

---

### Task 7: `POST /users/admin/reset-password` endpoint

**Files:**
- Modify: `app/src/app/modules/users/users.controller.ts`
- Create: `app/src/app/modules/users/dto/admin-reset-password.dto.ts`

- [ ] **Step 1: Create the DTO**

Create `app/src/app/modules/users/dto/admin-reset-password.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'target@condor.com.br' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, minimum: 8, maximum: 64, default: 12 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(64)
  length?: number;
}

export class AdminResetPasswordResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  resetAt: Date;
}
```

- [ ] **Step 2: Register `AdminAllowlistGuard` in `UsersModule`**

Open `app/src/app/modules/users/users.module.ts`. Ensure the file exports the module with `AdminAllowlistGuard` and `SuperAdminGuard` in `providers`. Add:

```ts
import { AdminAllowlistGuard } from '../../core/auth/admin-allowlist.guard';
import { SuperAdminGuard } from '../../core/auth/super-admin.guard';

// in @Module({ providers: [...] })
providers: [
  // ...existing providers...
  AdminAllowlistGuard,
  SuperAdminGuard,
],
```

Verify by running `cd app && npm run build` — expected: no errors. If a build issue appears about missing `AuditLogService` import, hold; we'll wire audit in step 4.

- [ ] **Step 3: Add the controller endpoint**

Open `app/src/app/modules/users/users.controller.ts`. At the top, add imports:

```ts
import { AdminAllowlistGuard } from '../../core/auth/admin-allowlist.guard';
import { SuperAdminGuard } from '../../core/auth/super-admin.guard';
import { AdminResetPasswordDto, AdminResetPasswordResponseDto } from './dto/admin-reset-password.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-log/audit-log.constants';
import { Header, Res } from '@nestjs/common';
import type { Response } from 'express';
```

Add `AuditLogService` to the constructor:

```ts
constructor(
  @Inject(forwardRef(() => UsersService))
  private readonly usersService: UsersService,
  private readonly report: ReportsService,
  private readonly auditLog: AuditLogService,
) {}
```

Add this endpoint inside the class:

```ts
@Post('admin/reset-password')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminAllowlistGuard)
@ApiOperation({ summary: 'Reset da senha de um usuário (admin) — retorna a nova senha em texto plano' })
@ApiOkResponse({ type: AdminResetPasswordResponseDto })
@Header('Cache-Control', 'no-store')
@Header('Pragma', 'no-cache')
async adminResetPassword(
  @Req() req: Request,
  @Body() dto: AdminResetPasswordDto,
): Promise<AdminResetPasswordResponseDto> {
  const actor = (req as any).user;
  const result = await this.usersService.adminResetPassword(dto.email, dto.length);
  this.auditLog.emit({
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET_BY_ADMIN,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: null,
    actor: { userId: String(actor.id), email: actor.email, role: actor.role },
    metadata: { targetEmail: dto.email },
  });
  return result;
}
```

Note: `resourceId` is `null` because we don't want to leak the target `_id` in the audit trail if the caller only knows the email; the target email lives in `metadata`.

- [ ] **Step 4: Manual smoke test**

Start the dev server: `cd app && npm run start:dev`. In another shell, log in as the super admin (`SUPER_ADMIN_EMAIL` set locally to your dev user), grab the JWT, then:

```bash
curl -X POST http://localhost:3000/users/admin/reset-password \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@condor.com.br","length":12}'
```

Expected: `200` with `{ email, password, resetAt }`. Cache headers set.

Then try with a non-super-admin JWT: expected `403`.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/modules/users/users.controller.ts app/src/app/modules/users/users.module.ts app/src/app/modules/users/dto/admin-reset-password.dto.ts
git commit -m "feat(users): expose POST /users/admin/reset-password with audit log"
```

---

## Backend Phase — Feature 2: Impersonation

### Task 8: `UsersService.adminGenerateImpersonationToken` with tests

**Files:**
- Modify: `app/src/app/modules/users/users.service.ts`
- Modify: `app/tests/users-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `app/tests/users-admin.spec.ts` inside the outer `describe`:

```ts
describe('adminGenerateImpersonationToken', () => {
  it('generates a JWT with the target payload and 1h TTL', async () => {
    userModel.findOne.mockResolvedValue({
      _id: 'targetId',
      email: 'target@x.com',
      name: 'Target',
      role: 'user',
    });
    authenticator.generate.mockReturnValue('signed.jwt.token');
    authenticator.getTokenData.mockReturnValue({
      id: 'targetId', email: 'target@x.com', role: 'user', name: 'Target',
      exp: 1700000000, iat: 1699996400,
    });

    const result = await service.adminGenerateImpersonationToken('target@x.com');

    expect(authenticator.generate).toHaveBeenCalledWith(
      { id: 'targetId', email: 'target@x.com', role: 'user', name: 'Target' },
      '1h',
    );
    expect(result.token).toBe('signed.jwt.token');
    expect(result.exp).toBe(1700000000);
    expect(result.target).toEqual({ email: 'target@x.com', name: 'Target', role: 'user' });
  });

  it('throws NotFoundException when target does not exist', async () => {
    userModel.findOne.mockResolvedValue(null);
    await expect(service.adminGenerateImpersonationToken('nope@x.com')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: FAIL — `service.adminGenerateImpersonationToken is not a function`.

- [ ] **Step 3: Implement the service method**

Open `app/src/app/modules/users/users.service.ts`. Add near `adminResetPassword`:

```ts
async adminGenerateImpersonationToken(targetEmail: string): Promise<{
  token: string;
  exp: number;
  target: { email: string; name: string; role: string };
}> {
  const target = await this.userModel.findOne({ email: targetEmail });
  if (!target) {
    throw new NotFoundException(`Usuário não encontrado: ${targetEmail}`);
  }
  const token = this.authenticator.generate(
    {
      id: String(target._id),
      email: target.email,
      role: target.role,
      name: target.name,
    },
    '1h',
  );
  const decoded = this.authenticator.getTokenData(`Bearer ${token}`);
  return {
    token,
    exp: (decoded as any).exp,
    target: { email: target.email, name: target.name, role: target.role },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: PASS — 5 tests total (3 reset + 2 impersonate).

- [ ] **Step 5: Commit**

```bash
git add app/src/app/modules/users/users.service.ts app/tests/users-admin.spec.ts
git commit -m "feat(users): add adminGenerateImpersonationToken (1h TTL JWT)"
```

---

### Task 9: `POST /users/admin/impersonate` endpoint

**Files:**
- Modify: `app/src/app/modules/users/users.controller.ts`
- Create: `app/src/app/modules/users/dto/admin-impersonate.dto.ts`

- [ ] **Step 1: Create the DTO**

Create `app/src/app/modules/users/dto/admin-impersonate.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class AdminImpersonateDto {
  @ApiProperty({ example: 'target@condor.com.br' })
  @IsEmail()
  email: string;
}

export class AdminImpersonateResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  exp: number;

  @ApiProperty({ type: 'object', properties: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
  }})
  target: { email: string; name: string; role: string };
}
```

- [ ] **Step 2: Add the controller endpoint**

Open `app/src/app/modules/users/users.controller.ts`. Add imports:

```ts
import { AdminImpersonateDto, AdminImpersonateResponseDto } from './dto/admin-impersonate.dto';
import { BadRequestException } from '@nestjs/common';
```

Add the endpoint:

```ts
@Post('admin/impersonate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminAllowlistGuard)
@ApiOperation({ summary: 'Gera um JWT temporário (1h) para o admin ver o sistema como outro usuário' })
@ApiOkResponse({ type: AdminImpersonateResponseDto })
@Header('Cache-Control', 'no-store')
async adminImpersonate(
  @Req() req: Request,
  @Body() dto: AdminImpersonateDto,
): Promise<AdminImpersonateResponseDto> {
  const actor = (req as any).user;
  if (String(actor.email).toLowerCase() === dto.email.toLowerCase()) {
    throw new BadRequestException('Você não pode impersonar a si mesmo');
  }
  const result = await this.usersService.adminGenerateImpersonationToken(dto.email);
  this.auditLog.emit({
    action: AUDIT_ACTIONS.USER_IMPERSONATED,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: null,
    actor: { userId: String(actor.id), email: actor.email, role: actor.role },
    metadata: { targetEmail: dto.email, tokenExp: result.exp },
  });
  return result;
}
```

- [ ] **Step 3: Manual smoke test**

```bash
curl -X POST http://localhost:3000/users/admin/impersonate \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@condor.com.br"}'
```

Expected: `200` with `{ token, exp, target }`. Decode the returned token at jwt.io — payload should have `id/email/role/name` of the target user; `exp - iat` should be `3600`.

Try impersonating yourself: expected `400`.
Try with a non-existent email: expected `404`.
Try without allowlist: expected `403`.

- [ ] **Step 4: Commit**

```bash
git add app/src/app/modules/users/users.controller.ts app/src/app/modules/users/dto/admin-impersonate.dto.ts
git commit -m "feat(users): expose POST /users/admin/impersonate returning 1h JWT"
```

---

## Backend Phase — Feature 3: Allowlist CRUD

### Task 10: `UsersService` allowlist methods with tests

**Files:**
- Modify: `app/src/app/modules/users/users.service.ts`
- Modify: `app/tests/users-admin.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the outer `describe` in `app/tests/users-admin.spec.ts`:

```ts
describe('allowlist CRUD', () => {
  const original = process.env.SUPER_ADMIN_EMAIL;
  beforeAll(() => { process.env.SUPER_ADMIN_EMAIL = 'admin@condor.com.br'; });
  afterAll(() => { process.env.SUPER_ADMIN_EMAIL = original; });

  it('list returns users with isAdminAllowlist=true', async () => {
    userModel.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'u1', email: 'a@x.com', name: 'A', role: 'admin' },
        ]),
      }),
    }) as any;
    const items = await service.allowlistList();
    expect(userModel.find).toHaveBeenCalledWith({ isAdminAllowlist: true });
    expect(items).toEqual([{ id: 'u1', email: 'a@x.com', name: 'A', role: 'admin' }]);
  });

  it('add sets flag=true and throws 404 if user missing', async () => {
    userModel.findOne.mockResolvedValueOnce({ _id: 'u1', email: 'a@x.com' });
    userModel.updateOne.mockResolvedValue({ acknowledged: true });
    await service.allowlistAdd('a@x.com');
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      { $set: { isAdminAllowlist: true } },
    );

    userModel.findOne.mockResolvedValueOnce(null);
    await expect(service.allowlistAdd('missing@x.com')).rejects.toThrow(NotFoundException);
  });

  it('remove sets flag=false and rejects removing the super admin', async () => {
    userModel.findOne.mockResolvedValue({ _id: 'u1', email: 'other@x.com' });
    userModel.updateOne.mockResolvedValue({ acknowledged: true });
    await service.allowlistRemove('other@x.com');
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: 'u1' },
      { $set: { isAdminAllowlist: false } },
    );

    await expect(service.allowlistRemove('admin@condor.com.br')).rejects.toThrow(/super admin/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: FAIL — methods don't exist yet.

- [ ] **Step 3: Implement the service methods**

Open `app/src/app/modules/users/users.service.ts`. Add `BadRequestException` to the `@nestjs/common` import if not present. Add these methods:

```ts
async allowlistList(): Promise<Array<{ id: string; email: string; name: string; role: string }>> {
  const users = await this.userModel
    .find({ isAdminAllowlist: true })
    .select({ email: 1, name: 1, role: 1 })
    .lean();
  return users.map((u: any) => ({
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
  }));
}

async allowlistAdd(email: string): Promise<void> {
  const user = await this.userModel.findOne({ email });
  if (!user) {
    throw new NotFoundException(`Usuário não encontrado: ${email}. Crie o usuário primeiro.`);
  }
  await this.userModel.updateOne({ _id: user._id }, { $set: { isAdminAllowlist: true } });
}

async allowlistRemove(email: string): Promise<void> {
  const superAdmin = (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim();
  if (email.toLowerCase().trim() === superAdmin) {
    throw new BadRequestException('Não é possível remover o super admin da allowlist');
  }
  const user = await this.userModel.findOne({ email });
  if (!user) {
    throw new NotFoundException(`Usuário não encontrado: ${email}`);
  }
  await this.userModel.updateOne({ _id: user._id }, { $set: { isAdminAllowlist: false } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -- users-admin.spec.ts`
Expected: PASS — 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/modules/users/users.service.ts app/tests/users-admin.spec.ts
git commit -m "feat(users): add allowlist CRUD service methods (list/add/remove)"
```

---

### Task 11: Allowlist endpoints (CRUD + /me)

**Files:**
- Modify: `app/src/app/modules/users/users.controller.ts`

- [ ] **Step 1: Add endpoints**

Open `app/src/app/modules/users/users.controller.ts`. Add these endpoints:

```ts
@Get('admin/allowlist/me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminAllowlistGuard)
@ApiOperation({ summary: 'Verifica se o usuário atual está autorizado para ferramentas admin' })
async allowlistMe(): Promise<{ allowed: true }> {
  // AdminAllowlistGuard already validated — reaching here means allowed
  return { allowed: true };
}

@Get('admin/allowlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiOperation({ summary: 'Lista usuários com acesso a ferramentas admin (super admin only)' })
async allowlistList(): Promise<{ items: Array<{ id: string; email: string; name: string; role: string }> }> {
  const items = await this.usersService.allowlistList();
  return { items };
}

@Post('admin/allowlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiOperation({ summary: 'Dá acesso admin a um usuário existente (super admin only)' })
async allowlistAdd(
  @Req() req: Request,
  @Body() dto: AdminImpersonateDto, // reusing — same shape { email }
): Promise<{ ok: true }> {
  const actor = (req as any).user;
  await this.usersService.allowlistAdd(dto.email);
  this.auditLog.emit({
    action: AUDIT_ACTIONS.ADMIN_ALLOWLIST_ADDED,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: null,
    actor: { userId: String(actor.id), email: actor.email, role: actor.role },
    metadata: { targetEmail: dto.email },
  });
  return { ok: true };
}

@Delete('admin/allowlist/:email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiOperation({ summary: 'Remove o acesso admin de um usuário (super admin only)' })
async allowlistRemove(
  @Req() req: Request,
  @Param('email') email: string,
): Promise<{ ok: true }> {
  const actor = (req as any).user;
  await this.usersService.allowlistRemove(email);
  this.auditLog.emit({
    action: AUDIT_ACTIONS.ADMIN_ALLOWLIST_REMOVED,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: null,
    actor: { userId: String(actor.id), email: actor.email, role: actor.role },
    metadata: { targetEmail: email },
  });
  return { ok: true };
}
```

Note on `Delete` decorator: ensure `Delete` and `Param` are in the top import from `@nestjs/common` (they likely already are).

- [ ] **Step 2: Manual smoke test**

Start server. With super admin JWT:

```bash
# add someone
curl -X POST http://localhost:3000/users/admin/allowlist \
  -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@condor.com.br"}'
# expected: { "ok": true }

# list
curl http://localhost:3000/users/admin/allowlist \
  -H "Authorization: Bearer <SUPER_ADMIN_JWT>"
# expected: { "items": [{id,email,name,role}] }

# me (as the just-added user, after re-login)
curl http://localhost:3000/users/admin/allowlist/me \
  -H "Authorization: Bearer <ADDED_USER_JWT>"
# expected: { "allowed": true }

# remove
curl -X DELETE http://localhost:3000/users/admin/allowlist/someone@condor.com.br \
  -H "Authorization: Bearer <SUPER_ADMIN_JWT>"
# expected: { "ok": true }

# try to remove super admin
curl -X DELETE "http://localhost:3000/users/admin/allowlist/$SUPER_ADMIN_EMAIL" \
  -H "Authorization: Bearer <SUPER_ADMIN_JWT>"
# expected: 400
```

- [ ] **Step 3: Commit**

```bash
git add app/src/app/modules/users/users.controller.ts
git commit -m "feat(users): expose /users/admin/allowlist CRUD + /me"
```

---

## Frontend Phase — BFF routes

### Task 12: BFF route for reset-password (catch-all proxy)

**Files:**
- Create: `web-next/app/api/admin/reset-password/route.ts`

- [ ] **Step 1: Create the route**

Create `web-next/app/api/admin/reset-password/route.ts`:

```ts
import { proxyToApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxyToApi(req, { upstreamPath: "/users/admin/reset-password" });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-next/app/api/admin/reset-password/route.ts
git commit -m "feat(web): BFF route for admin reset-password"
```

---

### Task 13: BFF routes for impersonate + stop (cookie swap)

**Files:**
- Create: `web-next/app/api/admin/impersonate/route.ts`
- Create: `web-next/app/api/admin/impersonate/stop/route.ts`
- Create: `web-next/lib/auth/impersonation.ts`

- [ ] **Step 1: Extract cookie helpers**

Create `web-next/lib/auth/impersonation.ts`:

```ts
import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessCookieOptions } from "./cookies";
import { decodeJwt, isJwtExpired } from "./jwt";

export const ADMIN_COOKIE = "bi_admin_token";

export async function beginImpersonation(targetToken: string): Promise<void> {
  const store = await cookies();
  const current = store.get(ACCESS_COOKIE);
  if (!current) throw new Error("no active session");

  const targetDecoded = decodeJwt(targetToken);
  const adminDecoded = decodeJwt(current.value);
  const now = Math.floor(Date.now() / 1000);

  const targetMaxAge = targetDecoded?.exp ? Math.max(1, targetDecoded.exp - now) : 3600;
  const adminMaxAge = adminDecoded?.exp ? Math.max(1, adminDecoded.exp - now) : 3600;

  store.set(ADMIN_COOKIE, current.value, accessCookieOptions(adminMaxAge));
  store.set(ACCESS_COOKIE, targetToken, accessCookieOptions(targetMaxAge));
}

export async function stopImpersonation(): Promise<{ ok: true; expired: boolean }> {
  const store = await cookies();
  const admin = store.get(ADMIN_COOKIE);
  if (!admin) return { ok: true, expired: false };

  if (isJwtExpired(admin.value)) {
    store.delete(ADMIN_COOKIE);
    store.delete(ACCESS_COOKIE);
    return { ok: true, expired: true };
  }

  const decoded = decodeJwt(admin.value);
  const now = Math.floor(Date.now() / 1000);
  const maxAge = decoded?.exp ? Math.max(1, decoded.exp - now) : 3600;

  store.set(ACCESS_COOKIE, admin.value, accessCookieOptions(maxAge));
  store.delete(ADMIN_COOKIE);
  return { ok: true, expired: false };
}
```

- [ ] **Step 2: Create the start route**

Create `web-next/app/api/admin/impersonate/route.ts`:

```ts
import { proxyToApi } from "@/lib/api/proxy";
import { beginImpersonation } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const upstream = await proxyToApi(req.clone(), {
    upstreamPath: "/users/admin/impersonate",
  });

  if (!upstream.ok) {
    return upstream;
  }

  const body = (await upstream.json()) as { token: string; exp: number; target: { email: string; name: string; role: string } };
  await beginImpersonation(body.token);

  return Response.json({ target: body.target });
}
```

- [ ] **Step 3: Create the stop route**

Create `web-next/app/api/admin/impersonate/stop/route.ts`:

```ts
import { stopImpersonation } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await stopImpersonation();
  return Response.json(result);
}
```

- [ ] **Step 4: Typecheck**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web-next/app/api/admin/impersonate/route.ts web-next/app/api/admin/impersonate/stop/route.ts web-next/lib/auth/impersonation.ts
git commit -m "feat(web): BFF routes for start/stop impersonation with cookie swap"
```

---

### Task 14: BFF catch-all for allowlist

**Files:**
- Create: `web-next/app/api/admin/allowlist/[[...path]]/route.ts`

- [ ] **Step 1: Create the route**

Create `web-next/app/api/admin/allowlist/[[...path]]/route.ts`:

```ts
import { proxyToApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ path?: string[] }>;
}

async function handle(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const upstreamPath = "/users/admin/allowlist" + (path.length > 0 ? "/" + path.join("/") : "");
  return proxyToApi(req, { upstreamPath });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
```

- [ ] **Step 2: Typecheck**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-next/app/api/admin/allowlist/[[...path]]/route.ts
git commit -m "feat(web): BFF catch-all for admin allowlist CRUD"
```

---

## Frontend Phase — Admin helpers

### Task 15: Admin helper `lib/auth/admin.ts`

**Files:**
- Create: `web-next/lib/auth/admin.ts`

- [ ] **Step 1: Create the helper**

Create `web-next/lib/auth/admin.ts`:

```ts
import { apiServer } from "@/lib/api/server";
import { getSession } from "@/lib/auth/session";

export function isSuperAdmin(email: string | undefined): boolean {
  const configured = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
  if (!configured || !email) return false;
  return email.toLowerCase().trim() === configured;
}

export async function currentUserIsSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return isSuperAdmin(session?.payload.email);
}

export async function currentUserIsAllowedAdmin(): Promise<boolean> {
  try {
    // apiServer hits the backend directly (attaches JWT from bi_token cookie).
    // The backend path is /users/admin/allowlist/me — NOT the BFF path /api/...
    await apiServer.get<{ allowed: true }>("/users/admin/allowlist/me");
    return true;
  } catch {
    return false;
  }
}
```

Note: verify the `apiServer` export path with `rg "export.*apiServer" web-next/lib`. If it's under `@/lib/api/server` (as shown in the reference code), the import above is correct. Also verify `getSession` — likely under `@/lib/auth/session`.

- [ ] **Step 2: Typecheck**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web-next/lib/auth/admin.ts
git commit -m "feat(web): admin helpers (isSuperAdmin, currentUserIsAllowedAdmin)"
```

---

## Frontend Phase — Pages

### Task 16: `/admin/reset-password` page

**Files:**
- Create: `web-next/app/(dashboard)/admin/reset-password/page.tsx`
- Create: `web-next/app/(dashboard)/admin/reset-password/_components/reset-form.tsx`

- [ ] **Step 1: Create the page (server component with gate)**

Create `web-next/app/(dashboard)/admin/reset-password/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { currentUserIsAllowedAdmin } from "@/lib/auth/admin";
import { ResetForm } from "./_components/reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const allowed = await currentUserIsAllowedAdmin();
  if (!allowed) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Reset de senha</h1>
        <p className="text-sm text-muted-foreground">
          Gera uma nova senha aleatória para o usuário. A senha aparece uma única vez.
        </p>
      </div>
      <ResetForm />
    </div>
  );
}
```

- [ ] **Step 2: Create the client form**

Create `web-next/app/(dashboard)/admin/reset-password/_components/reset-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResetResult {
  email: string;
  password: string;
  resetAt: string;
}

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [length, setLength] = useState<number>(12);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, length }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erro ${res.status}`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email do usuário</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@condor.com.br"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="length">Comprimento da senha</Label>
          <Input
            id="length"
            type="number"
            min={8}
            max={64}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Gerando..." : "Resetar senha"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Senha gerada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Email</Label>
              <p className="font-mono">{result.email}</p>
            </div>
            <div>
              <Label>Nova senha</Label>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono">{result.password}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(result.password)}
                >
                  Copiar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ⚠️ Esta senha não será mostrada novamente. Copie agora.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify shadcn primitives exist**

Run: `ls web-next/components/ui/button.tsx web-next/components/ui/input.tsx web-next/components/ui/label.tsx web-next/components/ui/card.tsx`
Expected: all files exist. If any is missing, run: `cd web-next && pnpm dlx shadcn@latest add button input label card`

- [ ] **Step 4: Typecheck**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Manual test**

Run: `cd web-next && pnpm dev`. Navigate to `http://localhost:3002/admin/reset-password`.
Expected: page loads (if you're the super admin); enter a target email → new password appears.
If you're NOT in allowlist: expected 404 page.

- [ ] **Step 6: Commit**

```bash
git add "web-next/app/(dashboard)/admin/reset-password"
git commit -m "feat(web): /admin/reset-password page with form + copy button"
```

---

### Task 17: `/admin/impersonate` page

**Files:**
- Create: `web-next/app/(dashboard)/admin/impersonate/page.tsx`
- Create: `web-next/app/(dashboard)/admin/impersonate/_components/user-search.tsx`

- [ ] **Step 1: Create the page**

Create `web-next/app/(dashboard)/admin/impersonate/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { currentUserIsAllowedAdmin } from "@/lib/auth/admin";
import { UserSearch } from "./_components/user-search";

export const dynamic = "force-dynamic";

export default async function ImpersonatePage() {
  const allowed = await currentUserIsAllowedAdmin();
  if (!allowed) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Ver como outro usuário</h1>
        <p className="text-sm text-muted-foreground">
          Sua sessão será substituída pela do usuário selecionado por até 1 hora.
          Um banner permitirá voltar à sua sessão em qualquer momento.
        </p>
      </div>
      <UserSearch />
    </div>
  );
}
```

- [ ] **Step 2: Create the search client**

Create `web-next/app/(dashboard)/admin/impersonate/_components/user-search.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function UserSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Erro ${res.status}`);
        const body = await res.json();
        const items = Array.isArray(body) ? body : body.items ?? [];
        setResults(
          items.map((u: any) => ({
            id: String(u._id ?? u.id),
            email: u.email,
            name: u.name,
            role: u.role,
          })),
        );
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function impersonate(email: string) {
    setError(null);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || `Erro ${res.status}`);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nome ou email..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <p className="text-sm text-muted-foreground">Buscando...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y rounded border">
        {results.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <p className="font-medium">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.email} · {u.role}</p>
            </div>
            <Button size="sm" onClick={() => impersonate(u.email)}>Ver como este</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Note: the `/api/users?search=...` endpoint may or may not exist under that exact query param. Verify with `rg "GET.*users" web-next/app/api/users` or the backend's Swagger at `http://localhost:3000/api`. If the search flag differs (e.g., `?name=` or `?q=`), adapt the fetch URL.

- [ ] **Step 3: Typecheck + manual test**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

Run dev, navigate to `/admin/impersonate`, search for a user, click "Ver como este".
Expected: redirect to `/`, everything you see is now the target user's data. Sidebar shows target's role.

- [ ] **Step 4: Commit**

```bash
git add "web-next/app/(dashboard)/admin/impersonate"
git commit -m "feat(web): /admin/impersonate page with user search and start"
```

---

### Task 18: `/admin/allowlist` page (super admin only)

**Files:**
- Create: `web-next/app/(dashboard)/admin/allowlist/page.tsx`
- Create: `web-next/app/(dashboard)/admin/allowlist/_components/allowlist-table.tsx`

- [ ] **Step 1: Create the page**

Create `web-next/app/(dashboard)/admin/allowlist/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { currentUserIsSuperAdmin } from "@/lib/auth/admin";
import { AllowlistTable } from "./_components/allowlist-table";

export const dynamic = "force-dynamic";

export default async function AllowlistPage() {
  const isSuper = await currentUserIsSuperAdmin();
  if (!isSuper) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Gestão de acessos admin</h1>
        <p className="text-sm text-muted-foreground">
          Usuários que podem usar reset de senha e impersonation. Apenas você (super admin) pode alterar esta lista.
        </p>
      </div>
      <AllowlistTable />
    </div>
  );
}
```

- [ ] **Step 2: Create the table client component**

Create `web-next/app/(dashboard)/admin/allowlist/_components/allowlist-table.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Item {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function AllowlistTable() {
  const [items, setItems] = useState<Item[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/allowlist");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const body = await res.json();
      setItems(body.items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    setError(null);
    const res = await fetch("/api/admin/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || `Erro ${res.status}`);
      return;
    }
    setNewEmail("");
    refresh();
  }

  async function remove(email: string) {
    if (!confirm(`Remover acesso admin de ${email}?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/allowlist/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || `Erro ${res.status}`);
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="email@condor.com.br"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <Button onClick={add} disabled={!newEmail}>Dar acesso</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Email</th>
              <th className="py-2">Nome</th>
              <th className="py-2">Rol</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.name}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2 text-right">
                  <Button variant="destructive" size="sm" onClick={() => remove(u.email)}>Quitar</Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Ninguém tem acesso ainda (além do super admin).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + manual test**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

Run dev, navigate to `/admin/allowlist` as super admin.
Expected: page loads, empty table. Add a user by email → appears in table. Remove → disappears.

- [ ] **Step 4: Commit**

```bash
git add "web-next/app/(dashboard)/admin/allowlist"
git commit -m "feat(web): /admin/allowlist page (super admin only)"
```

---

### Task 19: `ImpersonationBanner` + layout integration

**Files:**
- Create: `web-next/app/(dashboard)/_components/impersonation-banner.tsx`
- Create: `web-next/app/(dashboard)/_components/impersonation-stop-action.ts`
- Modify: `web-next/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the server action**

Create `web-next/app/(dashboard)/_components/impersonation-stop-action.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stopImpersonation } from "@/lib/auth/impersonation";

export async function stopImpersonationAction() {
  const result = await stopImpersonation();
  if (result.expired) {
    redirect("/login");
  }
  revalidatePath("/");
}
```

- [ ] **Step 2: Create the banner component**

Create `web-next/app/(dashboard)/_components/impersonation-banner.tsx`:

```tsx
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/auth/impersonation";
import { decodeJwt } from "@/lib/auth/jwt";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { stopImpersonationAction } from "./impersonation-stop-action";

export async function ImpersonationBanner() {
  const store = await cookies();
  const admin = store.get(ADMIN_COOKIE);
  if (!admin) return null;

  const target = store.get(ACCESS_COOKIE);
  const decoded = target ? decodeJwt(target.value) : null;
  const name = (decoded?.name as string | undefined) ?? (decoded?.email as string | undefined) ?? "usuário";

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 bg-destructive px-4 py-2 text-destructive-foreground shadow-md">
      <p className="text-sm">
        Você está vendo como <strong>{name}</strong>
      </p>
      <form action={stopImpersonationAction}>
        <button type="submit" className="rounded bg-white/20 px-3 py-1 text-sm font-medium hover:bg-white/30">
          Voltar à minha sessão
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Mount in layout**

Open `web-next/app/(dashboard)/layout.tsx`. Add import at top:

```ts
import { ImpersonationBanner } from "./_components/impersonation-banner";
```

Inside the returned JSX, add `<ImpersonationBanner />` as the FIRST child of the outer wrapper — so it sits above everything else. Add a top padding to the main container when the banner is visible. The simplest way: put the banner outside the flex row that holds the sidebar+content, and add `pt-10` conditionally via CSS. For simplicity, always reserve the space:

```tsx
return (
  <>
    <ImpersonationBanner />
    <div className="flex h-screen">
      {/* existing content — unchanged */}
    </div>
  </>
);
```

Note: because the banner is `fixed top-0`, the underlying content may need `pt-10` when banner is visible. For MVP, accept 40px overlap on the top of the sidebar/nav. If it looks bad, wrap the flex in a div with conditional padding based on the cookie presence.

- [ ] **Step 4: Typecheck + manual test**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

Run dev. Impersonate a user → banner appears at the top, red, with the target's name. Click "Voltar" → banner disappears, you're back in your session.

- [ ] **Step 5: Commit**

```bash
git add "web-next/app/(dashboard)/_components/impersonation-banner.tsx" "web-next/app/(dashboard)/_components/impersonation-stop-action.ts" "web-next/app/(dashboard)/layout.tsx"
git commit -m "feat(web): impersonation banner + stop server action"
```

---

### Task 20: Sidebar items (conditional visibility)

**Files:**
- Modify: `web-next/app/(dashboard)/_components/sidebar.tsx` (or wherever the sidebar lives; verify with `rg "Sidebar" web-next/app/\(dashboard\)`)

- [ ] **Step 1: Identify the sidebar file**

Run: `rg "export.*Sidebar" web-next/app` — locate the file that renders the sidebar (likely `web-next/app/(dashboard)/_components/sidebar.tsx` or similar).

- [ ] **Step 2: Add admin group with conditional rendering**

At the top of the sidebar component (server component), read the flags:

```tsx
import { currentUserIsSuperAdmin, currentUserIsAllowedAdmin } from "@/lib/auth/admin";

export async function Sidebar(/* existing props */) {
  const isSuper = await currentUserIsSuperAdmin();
  const isAllowed = isSuper || (await currentUserIsAllowedAdmin());

  return (
    <aside /* ... */>
      {/* existing sidebar items */}

      {isAllowed && (
        <div className="mt-4">
          <p className="px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
            Herramientas admin
          </p>
          <a href="/admin/reset-password" className="block rounded px-3 py-2 hover:bg-accent">
            Reset password
          </a>
          <a href="/admin/impersonate" className="block rounded px-3 py-2 hover:bg-accent">
            Ver como usuario
          </a>
          {isSuper && (
            <a href="/admin/allowlist" className="block rounded px-3 py-2 hover:bg-accent">
              Gestión de accesos admin
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
```

Adapt the classNames to match the existing sidebar's visual style (Twenty tokens).

- [ ] **Step 3: Typecheck + manual test**

Run: `cd web-next && pnpm typecheck`
Expected: no errors.

Run dev. As super admin: 3 items visible. As allowlist user: 2 items (no allowlist). As regular user: nothing.

- [ ] **Step 4: Commit**

```bash
git add "web-next/app/(dashboard)/_components/sidebar.tsx"
git commit -m "feat(web): conditional admin group in sidebar (allowlist + super admin)"
```

---

## Verification Phase

### Task 21: End-to-end manual checklist

**Files:** none

- [ ] **Step 1: Set env vars**

Ensure both `app/.env` and `web-next/.env.local` have:
```
SUPER_ADMIN_EMAIL=hector.velasques@condor.com.br
```

Restart both dev servers.

- [ ] **Step 2: E2E checklist**

- [ ] Log in as super admin
- [ ] Sidebar shows "Herramientas admin" group with 3 items
- [ ] `/admin/reset-password` → generate password for another user, copy button works
- [ ] Verify the reset user can log in with the new password
- [ ] `/admin/allowlist` → add another user by email
- [ ] Log out, log in as that added user
- [ ] Sidebar shows 2 items (no allowlist)
- [ ] `/admin/allowlist` returns 404 for allowlist user
- [ ] `/admin/impersonate` works for allowlist user → banner appears
- [ ] Click "Voltar" → back to allowlist user's session
- [ ] Wait 1h (or manually expire the impersonation cookie) → session redirects to login OR falls back to admin
- [ ] Log in as regular user (not allowlist) → no admin items visible; direct URL access returns 404
- [ ] Check Mongo `auditlogs` collection has entries for each admin action

- [ ] **Step 3: Run full backend test suite**

Run: `cd app && npm test`
Expected: all existing tests pass + new admin tests pass. No regressions.

- [ ] **Step 4: Commit any final tweaks**

If the E2E checklist reveals fixes, commit them. Otherwise skip.

---

## Post-implementation notes

- The `bi_admin_token` cookie has the same expiry as the underlying admin JWT (20h). If the admin's session is due to expire and they've been impersonating for a while, the "Volver" fallback correctly returns them to `/login` via the `expired: true` path.
- `impersonate_stop` is NOT audited (BFF-only operation). If regulatory needs demand it, add a `POST /users/admin/impersonate/stop` endpoint that only writes the audit entry.
- The `SUPER_ADMIN_EMAIL` env var is read at guard-time (each request), not cached — changing it in Portainer takes effect immediately without needing to invalidate tokens.
- If `JwtAuthGuard.validateTokenAndGetUser` does NOT include `isAdminAllowlist` in the loaded user object, the `AdminAllowlistGuard` will fail silently for allowlisted users. Verify by adding `console.log(user)` in the guard once, then remove. If missing, ensure the guard's query uses `.select('+isAdminAllowlist')` or that no `.select()` restriction excludes it.
