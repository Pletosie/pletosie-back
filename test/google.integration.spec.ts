import { DataSource } from 'typeorm';
import { GoogleAuthService } from '../src/google-auth';
import { hashToken } from '../src/auth';
import { OAuth2Client } from 'google-auth-library';
import { entities, OAuthAttempt, Session, User } from '../src/entities';
describe('Identité Google et protection OAuth', () => {
  let db: DataSource;
  let service: GoogleAuthService;
  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqljs',
      entities,
      synchronize: true,
    }).initialize();
    service = new GoogleAuthService(db);
  });
  afterEach(async () => {
    await db.destroy();
    delete process.env.GOOGLE_ADMIN_EMAIL;
  });
  const profile = {
    sub: 'google-id',
    email: 'client@gmail.com',
    email_verified: true,
    name: 'Client',
    iss: 'https://accounts.google.com',
    aud: 'client-id',
    iat: 1,
    exp: 9999999999,
  };
  it('crée un client sans mot de passe et retrouve son identité stable', async () => {
    const a = await service.resolveUser(profile);
    const b = await service.resolveUser({ ...profile, name: 'Nouveau nom' });
    expect(a.id).toBe(b.id);
    const user = await db
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id=:id', { id: a.id })
      .getOneOrFail();
    expect(user.password).toBeNull();
    expect(a.role).toBe('client');
  });
  it('refuse une adresse non vérifiée', async () => {
    await expect(
      service.resolveUser({ ...profile, email_verified: false }),
    ).rejects.toThrow();
  });
  it('ne rattache pas automatiquement une adresse externe à Google Workspace', async () => {
    await db
      .getRepository(User)
      .save({
        id: 'old',
        name: 'Old',
        email: 'client@example.com',
        password: 'hash',
        role: 'client',
      });
    await expect(
      service.resolveUser({ ...profile, email: 'client@example.com' }),
    ).rejects.toThrow();
  });
  it('préserve les comptes clients existants et révoque leurs anciennes sessions', async () => {
    await db
      .getRepository(User)
      .save({
        id: 'old',
        name: 'Old',
        email: profile.email,
        password: 'hash',
        role: 'client',
      });
    await db
      .getRepository(Session)
      .save({ id: 'old-token', userId: 'old', expiresAt: '2100-01-01' });
    const user = await service.resolveUser(profile);
    expect(user.id).toBe('old');
    expect(await db.getRepository(Session).count()).toBe(0);
  });
  it('réserve le rôle administrateur à l’adresse explicitement configurée', async () => {
    process.env.GOOGLE_ADMIN_EMAIL = 'admin@gmail.com';
    expect((await service.resolveUser(profile)).role).toBe('client');
    expect(
      (
        await service.resolveUser({
          ...profile,
          sub: 'admin-sub',
          email: 'admin@gmail.com',
        })
      ).role,
    ).toBe('admin');
  });
  it('ne rattache pas un compte administrateur sans autorisation explicite', async () => {
    await db
      .getRepository(User)
      .save({
        id: 'admin',
        name: 'Admin',
        email: profile.email,
        password: 'hash',
        role: 'admin',
      });
    await expect(service.resolveUser(profile)).rejects.toThrow();
  });
  it('refuse un state ne correspondant pas au navigateur', async () => {
    await expect(service.consume('state-one', 'state-two')).rejects.toThrow();
  });
  it('le state est à usage unique', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test';
    process.env.GOOGLE_CLIENT_SECRET = 'test';
    process.env.GOOGLE_CALLBACK_URL =
      'http://localhost:4000/api/v1/auth/google/callback';
    try {
      const { state, url } = await service.begin();
      expect(new URL(url).searchParams.get('code_challenge_method')).toBe(
        'S256',
      );
      await service.consume(state, state);
      await expect(service.consume(state, state)).rejects.toThrow();
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CALLBACK_URL;
    }
  });
  it('refuse un state expiré', async () => {
    await db
      .getRepository(OAuthAttempt)
      .save({
        id: hashToken('expired'),
        verifier: 'v',
        nonce: 'n',
        expiresAt: '2000-01-01T00:00:00Z',
      });
    await expect(service.consume('expired', 'expired')).rejects.toThrow();
  });
  it('refuse un nonce différent dans le jeton validé',async()=>{jest.spyOn(service,'client').mockReturnValue({getToken:async()=>({tokens:{id_token:'signed-token'}}),verifyIdToken:async()=>({getPayload:()=>({...profile,nonce:'other'})})} as unknown as OAuth2Client);await expect(service.complete({id:'state',verifier:'pkce',nonce:'expected',expiresAt:'2100-01-01'},'code')).rejects.toThrow();expect(await db.getRepository(User).count()).toBe(0);});
  it('refuse un échange sans jeton d’identité',async()=>{jest.spyOn(service,'client').mockReturnValue({getToken:async()=>({tokens:{}})} as unknown as OAuth2Client);await expect(service.complete({id:'state',verifier:'pkce',nonce:'expected',expiresAt:'2100-01-01'},'code')).rejects.toThrow();});
});
