import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Post,
  Req,
  UseGuards,
  ConflictException,
} from '@nestjs/common';
import { IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { createHash, randomUUID } from 'crypto';
import { LessThanOrEqual } from 'typeorm';
import * as webPush from 'web-push';
import { AuthGuard } from './auth';
import type { AuthRequest } from './auth';
import { ShopService } from './shop.service';
import { Notification, PushDevice, PushDelivery, Session } from './entities';
export class PushKeysDto {
  @IsString() @Length(86, 90) p256dh: string;
  @IsString() @Length(22, 24) auth: string;
}
export class SubscribeDto {
  @IsString() @MaxLength(2048) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}
export class EndpointDto {
  @IsString() @MaxLength(2048) endpoint: string;
}
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private shop: ShopService) {}
  enabled() {
    return Boolean(
      process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
    );
  }
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.process().catch(() =>
        console.error('Push delivery pending retry'),
      );
    }, 3000);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  validateEndpoint(endpoint: string) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('Abonnement push invalide.');
    }
    const hosts = [
      'fcm.googleapis.com',
      'push.services.mozilla.com',
      'notify.windows.com',
      'push.apple.com',
    ];
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
    )
      throw new BadRequestException('Service push non reconnu.');
    return digest(endpoint);
  }
  async subscribe(dto: SubscribeDto, userId: string, sessionId: string) {
    const id = this.validateEndpoint(dto.endpoint);
    if (
      !dto.keys ||
      !/^[-_A-Za-z0-9=]+$/.test(dto.keys.p256dh) ||
      !/^[-_A-Za-z0-9=]+$/.test(dto.keys.auth) ||
      Buffer.from(dto.keys.p256dh, 'base64url').length !== 65 ||
      Buffer.from(dto.keys.auth, 'base64url').length !== 16
    )
      throw new BadRequestException('Clés push invalides.');
    if (!this.enabled())
      throw new BadRequestException(
        'Les notifications attendent leur configuration.',
      );
    return this.shop.transaction(async (em) => {
      const previous = await em.findOneBy(PushDevice, { id });
      if (previous && previous.userId !== userId) {
        const session = await em.findOneBy(Session, { id: previous.sessionId });
        if (session && Date.parse(session.expiresAt) > Date.now())
          throw new ConflictException(
            'Désactivez les notifications du compte précédent sur cet appareil.',
          );
      }
      await em.save(PushDevice, {
        id,
        userId,
        sessionId,
        endpoint: dto.endpoint,
        ...dto.keys,
        ...(previous ? { createdAt: previous.createdAt } : {}),
      });
      return { enabled: true };
    });
  }
  async unsubscribe(endpoint: string, userId: string) {
    await this.shop.db
      .getRepository(PushDevice)
      .delete({ id: this.validateEndpoint(endpoint), userId });
    return { enabled: false };
  }
  async enqueue() {
    await this.shop.transaction(async (em) => {
      const notes = await em.find(Notification, {
        where: { pushQueued: false },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      for (const note of notes) {
        if (!note.read) {
          const devices = await em.find(PushDevice, {
            where: { userId: note.userId },
          });
          for (const device of devices) {
            if (
              new Date(device.createdAt).getTime() >
              new Date(note.createdAt).getTime()
            )
              continue;
            const id = digest(`${note.id}:${device.id}`);
            if (!(await em.findOneBy(PushDelivery, { id })))
              await em.save(PushDelivery, {
                id,
                notificationId: note.id,
                deviceId: device.id,
                status: 'pending',
                attempts: 0,
                nextAttemptAt: new Date().toISOString(),
              });
          }
        }
        note.pushQueued = true;
        await em.save(note);
      }
    });
  }
  async process() {
    if (!this.enabled() || this.running) return;
    this.running = true;
    try {
      await this.enqueue();
      const now = new Date().toISOString();
      const jobs = await this.shop.db.getRepository(PushDelivery).find({
        where: [
          { status: 'pending', nextAttemptAt: LessThanOrEqual(now) },
          { status: 'processing', leaseUntil: LessThanOrEqual(now) },
        ],
        take: 20,
        order: { nextAttemptAt: 'ASC' },
      });
      for (const job of jobs) {
        const claimed = await this.shop.db
          .getRepository(PushDelivery)
          .createQueryBuilder()
          .update()
          .set({
            status: 'processing',
            leaseUntil: new Date(Date.now() + 60000).toISOString(),
          })
          .where(
            'id = :id AND (status = :pending OR (status = :processing AND "leaseUntil" <= :now))',
            { id: job.id, pending: 'pending', processing: 'processing', now },
          )
          .execute();
        if (claimed.affected !== 1) continue;
        await this.deliver(job);
      }
    } finally {
      this.running = false;
    }
  }
  async deliver(job: PushDelivery) {
    const repo = this.shop.db.getRepository(PushDelivery);
    const device = await this.shop.db
      .getRepository(PushDevice)
      .findOneBy({ id: job.deviceId });
    const note = await this.shop.db
      .getRepository(Notification)
      .findOneBy({ id: job.notificationId });
    const session = device
      ? await this.shop.db
          .getRepository(Session)
          .findOneBy({ id: device.sessionId })
      : null;
    if (
      !device ||
      !note ||
      note.read ||
      device.userId !== note.userId ||
      !session ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      await repo.update(job.id, { status: 'skipped' });
      return;
    }
    try {
      await this.send(device, {
        id: note.id,
        title: note.title,
        body:
          note.kind === 'message'
            ? 'Vous avez reçu un message dans l’atelier.'
            : 'Une nouvelle information vous attend sur Pletosie.',
        url: note.href,
      });
      await repo.update(job.id, { status: 'sent', attempts: job.attempts + 1 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.shop.db.getRepository(PushDevice).delete(device.id);
        await repo.update(job.id, {
          status: 'expired',
          attempts: job.attempts + 1,
        });
        return;
      }
      const attempts = job.attempts + 1;
      await repo.update(job.id, {
        status: attempts >= 6 ? 'failed' : 'pending',
        attempts,
        nextAttemptAt: new Date(
          Date.now() + Math.min(3600000, 10000 * 2 ** attempts),
        ).toISOString(),
      });
    }
  }
  async send(device: PushDevice, payload: object) {
    await webPush.sendNotification(
      {
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      JSON.stringify(payload),
      {
        TTL: 3600,
        urgency: 'high',
        timeout: 10000,
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT!,
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
      },
    );
  }
  async test(userId: string) {
    await this.shop.db
      .getRepository(Notification)
      .save({
        id: randomUUID(),
        userId,
        kind: 'test',
        title: 'Les notifications Pletosie sont activées',
        href: '/compte',
        read: false,
      });
    return { queued: true };
  }
}
@Controller('push')
@UseGuards(AuthGuard)
export class PushController {
  constructor(private push: PushService) {}
  @Get('config') config() {
    return {
      enabled: this.push.enabled(),
      publicKey: this.push.enabled() ? process.env.VAPID_PUBLIC_KEY : null,
    };
  }
  @Post('subscribe') subscribe(
    @Body() dto: SubscribeDto,
    @Req() req: AuthRequest,
  ) {
    return this.push.subscribe(dto, req.user.id, req.sessionId);
  }
  @Post('unsubscribe') unsubscribe(
    @Body() dto: EndpointDto,
    @Req() req: AuthRequest,
  ) {
    return this.push.unsubscribe(dto.endpoint, req.user.id);
  }
  @Post('test') test(@Req() req: AuthRequest) {
    return this.push.test(req.user.id);
  }
}
