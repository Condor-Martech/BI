import { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from '../src/app/core/auth/super-admin.guard';
import { AdminAllowlistGuard } from '../src/app/core/auth/admin-allowlist.guard';

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
