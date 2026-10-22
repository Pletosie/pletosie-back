import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { AuthGuard, AdminGuard } from './auth';
import { databaseOptions } from './database';
import { AudioService } from './audio.service';
import { PaymentsService } from './payments.service';
import { GoogleAuthController, GoogleAuthService } from './google-auth';
import { PushController, PushService } from './push';
@Module({
  imports: [TypeOrmModule.forRoot(databaseOptions())],
  controllers: [ShopController, GoogleAuthController, PushController],
  providers: [
    ShopService,
    AuthGuard,
    AdminGuard,
    AudioService,
    PaymentsService,
    GoogleAuthService,
    PushService,
  ],
})
export class AppModule {}
