import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { ModModule } from './app/modules/mod.module';
import { JobModule } from './app/core/jobs/jobs.module';
import { CoreCacheModule } from './app/core/cache/cache.module';

import { CACHE_CONF, CONF, PROVIDER, REDIS_CONF,
  STATIC_CONF, MONGO_ASYNC_CONF } from './app.config';

@Module({
  imports: [
    ConfigModule.forRoot(CONF),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 20 }),
    BullModule.forRootAsync(REDIS_CONF),
    CacheModule.registerAsync(CACHE_CONF),
    CoreCacheModule,
    ServeStaticModule.forRoot(STATIC_CONF),
    MongooseModule.forRootAsync(MONGO_ASYNC_CONF),
    ModModule,
    JobModule,
  ],

  providers: PROVIDER,

})
export class AppModule { }

