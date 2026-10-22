import { GoogleAuthController, GoogleAuthService } from '../src/google-auth';
import type { Request, Response } from 'express';
describe('Production Google callback relay', () => {
  const previous = { mode: process.env.NODE_ENV, frontend: process.env.FRONTEND_URL };
  afterEach(() => {
    for (const [key, value] of Object.entries({ NODE_ENV: previous.mode, FRONTEND_URL: previous.frontend }))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  it('returns the legacy callback to Vercel before consuming state', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://pletosie.vercel.app/';
    const consume = jest.fn();
    const controller = new GoogleAuthController({ consume } as unknown as GoogleAuthService);
    const redirect = jest.fn();
    await controller.callback('state', 'code', undefined as unknown as string, undefined as unknown as string,
      { hostname: 'pletosie.onrender.com', headers: {} } as Request,
      { set: jest.fn(), redirect } as unknown as Response);
    const target = new URL(redirect.mock.calls[0][0]);
    expect(target.origin).toBe('https://pletosie.vercel.app');
    expect(target.pathname).toBe('/api/v1/auth/google/callback');
    expect(target.searchParams.get('state')).toBe('state');
    expect(target.searchParams.get('relay')).toBe('1');
    expect(consume).not.toHaveBeenCalled();
  });
  it('does not loop or bypass validation when the cookie is absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://pletosie.vercel.app';
    const consume = jest.fn().mockRejectedValue(new Error('Missing cookie'));
    const controller = new GoogleAuthController({ consume } as unknown as GoogleAuthService);
    const redirect = jest.fn();
    await controller.callback('state', 'code', undefined as unknown as string, '1',
      { hostname: 'pletosie.onrender.com', headers: {} } as Request,
      { set: jest.fn(), clearCookie: jest.fn(), redirect } as unknown as Response);
    expect(consume).toHaveBeenCalledWith('state', undefined);
    expect(redirect).toHaveBeenCalledWith('https://pletosie.vercel.app/compte?connexion=echec');
  });
});
