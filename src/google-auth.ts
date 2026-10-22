import {
  Controller,
  Get,
  Injectable,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OAuth2Client,
  CodeChallengeMethod,
  TokenPayload,
} from 'google-auth-library';
import { DataSource, LessThan } from 'typeorm';
import { randomBytes, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { hashToken } from './auth';
import { OAuthAttempt, Session, User, PushDevice } from './entities';
@Injectable()
export class GoogleAuthService {
  
  constructor(private db: DataSource) { }
  enabled() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL,
    );
  }
  client() {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        'La connexion Google attend sa configuration.',
      );
    return new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_CALLBACK_URL,
    });
  }
  
  async begin() {
    const client = this.client();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const { codeVerifier, codeChallenge } =
      await client.generateCodeVerifierAsync();
    await this.db
      .getRepository(OAuthAttempt)
      .delete({ expiresAt: LessThan(new Date().toISOString()) });
    await this.db.getRepository(OAuthAttempt).save({
      id: hashToken(state),
      verifier: codeVerifier,
      nonce,
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    });
    return {
      state,
      url: client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        access_type: 'online',
        prompt: 'select_account',
      }),
    };
  }
  async consume(state: string, cookie?: string) {
    if (
      !cookie ||
      !state ||
      state.length > 200 ||
      hashToken(state) !== hashToken(cookie)
    )
      throw new UnauthorizedException('Connexion Google invalide.');
    const repo = this.db.getRepository(OAuthAttempt);
    const attempt = await repo.findOneBy({ id: hashToken(state) });
    if (!attempt)
      throw new UnauthorizedException('Connexion expirée ou déjà utilisée.');
    const removed = await repo.delete({ id: attempt.id });
    if (removed.affected !== 1 || Date.parse(attempt.expiresAt) < Date.now())
      throw new UnauthorizedException('Connexion expirée.');
    return attempt;
  }
  async complete(attempt: OAuthAttempt, code: string) {
    if (!code || code.length > 4096) throw new UnauthorizedException();
    const client = this.client();
    const { tokens } = await client.getToken({
      code,
      codeVerifier: attempt.verifier,
    });
    if (!tokens.id_token) throw new UnauthorizedException();
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || payload.nonce !== attempt.nonce)
      throw new UnauthorizedException('Réponse Google invalide.');
    return this.resolveUser(payload);
  }
  async resolveUser(payload: TokenPayload) {
    if (
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        payload.iss,
      )
    )
      throw new UnauthorizedException(
        'Une adresse vérifiée par Google est requise.',
      );
    const email = payload.email.toLowerCase();
    const authoritative = email.endsWith('@gmail.com') || Boolean(payload.hd);
    const adminEmail = process.env.GOOGLE_ADMIN_EMAIL?.trim().toLowerCase();
    return this.db.transaction(async (em) => {
      let user = await em
        .getRepository(User)
        .createQueryBuilder('u')
        .addSelect('u.googleSub')
        .where('u.googleSub = :sub', { sub: payload.sub })
        .getOne();
      if (user) {
        if (adminEmail === email && authoritative && user.role !== 'admin') {
          user.role = 'admin';
          await em.update(User, user.id, { role: 'admin' });
        }
        if (user.email !== email) {
          const duplicate = await em.findOneBy(User, { email });
          if (duplicate && duplicate.id !== user.id)
            throw new UnauthorizedException();
          user.email = email;
          await em.save(user);
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      }
      user = await em.findOneBy(User, { email });
      if (user) {
        if (!authoritative || (user.role === 'admin' && adminEmail !== email))
          throw new UnauthorizedException(
            'Ce compte existant nécessite une association par l’administratrice.',
          );
        const bound = await em
          .getRepository(User)
          .createQueryBuilder('u')
          .addSelect('u.googleSub')
          .where('u.id = :id', { id: user.id })
          .getOne();
        if (bound?.googleSub) throw new UnauthorizedException();
        await em.delete(Session, { userId: user.id });
        if (adminEmail === email && authoritative) user.role = 'admin';
        await em.update(User, user.id, {
          googleSub: payload.sub,
          password: null as unknown as string,
          role: user.role,
        });
      } else
        user = await em.save(User, {
          id: randomUUID(),
          name: payload.name?.slice(0, 100) || email.split('@')[0],
          email,
          googleSub: payload.sub,
          role: adminEmail === email && authoritative ? 'admin' : 'client',
        });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    });
  }
  async session(userId: string, res: Response, previousToken?: string) {
    if (previousToken) {
      const sessionId = hashToken(previousToken);
      await this.db.getRepository(PushDevice).delete({ sessionId });
      await this.db.getRepository(Session).delete({ id: sessionId });
    }
    const token = randomBytes(32).toString('hex');
    await this.db.getRepository(Session).save({
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });


    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    };
  }
}
const isProd = process.env.NODE_ENV === 'production';
@Controller('auth')
export class GoogleAuthController {
  constructor(private google: GoogleAuthService) { }
  @Get('providers') providers() {
    return { google: this.google.enabled() };
  }
  @Get('google') async begin(@Res() res: Response) {
    res.set('Cache-Control', 'no-store');
    if (!this.google.enabled())
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/compte?connexion=configuration`,
      );
    const { state, url } = await this.google.begin();
    res.cookie('pletosie_oauth', state, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 10 * 60000,
      path: '/api/v1/auth/google',
    });
    return res.redirect(url);
  }
  @Get('google/callback') async callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    const cookie = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('pletosie_oauth='))
      ?.slice('pletosie_oauth='.length);
    res.clearCookie('pletosie_oauth', { path: '/api/v1/auth/google' });
    try {
      const attempt = await this.google.consume(state, cookie);
      if (error) return res.redirect(`${frontend}/compte?connexion=annulee`);
      const user = await this.google.complete(attempt, code);
      const previous = req.headers.cookie
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('pletosie_session='))
        ?.slice('pletosie_session='.length);
      await this.google.session(user.id, res, previous);
      return res.redirect(`${frontend}/compte`);
    } catch {
      return res.redirect(`${frontend}/compte?connexion=echec`);
    }
  }
}
