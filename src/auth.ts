import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { Session, User } from './entities';
import type { Request } from 'express';
export type AuthRequest = Request & { user: User; sessionId: string };
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private db: DataSource) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const cookie = req.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('pletosie_session='))
      ?.slice(17);
    if (!cookie)
      throw new UnauthorizedException('Connectez-vous pour continuer.');
    const session = await this.db
      .getRepository(Session)
      .findOneBy({ id: hashToken(cookie) });
    if (!session || session.expiresAt < new Date().toISOString())
      throw new UnauthorizedException('Votre session a expiré.');
    const user = await this.db
      .getRepository(User)
      .findOneBy({ id: session.userId });
    if (!user) throw new UnauthorizedException();
    req.user = user;
    req.sessionId = session.id;
    return true;
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (ctx.switchToHttp().getRequest<AuthRequest>().user?.role !== 'admin')
      throw new ForbiddenException('Accès réservé à l’administration.');
    return true;
  }
}
