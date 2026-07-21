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
