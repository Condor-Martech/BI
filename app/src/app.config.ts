import {
  BullRootModuleOptions,
  SharedBullAsyncConfiguration,
} from "@nestjs/bull";
import { CacheModuleAsyncOptions, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModuleAsyncOptions } from "@nestjs/mongoose";
import { ServeStaticModuleOptions } from "@nestjs/serve-static";
import { redisStore } from "cache-manager-redis-yet";
import { ConnectOptions } from "mongoose";
import { join } from "path";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./app/core/auth/auth.guard";
import { RolesGuard } from "./app/core/auth/roles.guard";
import { BackupService } from "./app/core/services/backup.service";
import { TasksService } from "./app/core/services/tasks.services";
import { EncryptionService } from "./app/core/utils/encryption.service";

const REQUIRED_ENV_VARS = [
  "MONGO_DSN",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "POWER_BI_BASE_URL",
  "AZURE_URL",
  "AZURE_CLIENT_SECRET",
  "REDIS_HOST",
  "REDIS_PORT",
  // BASE_URL é usado para construir o link de set-password do welcome email.
  "BASE_URL",
  // Endpoint HTTP do serviço de envio de emails (welcome + reset password).
  "EMAIL_API_URL",
  // Basic-auth obrigatório no Bull Board (/admin/queues).
  "BULL_BOARD_USER",
  "BULL_BOARD_PASS",
];

function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`
    );
  }
  if (!config["SUPER_ADMIN_EMAILS"] && !config["SUPER_ADMIN_EMAIL"]) {
    throw new Error(
      "Variável de ambiente obrigatória ausente: SUPER_ADMIN_EMAILS (lista separada por vírgula) ou SUPER_ADMIN_EMAIL (legado, único email)"
    );
  }
  return config;
}

export const CONF = { isGlobal: true, validate: validateEnv };

export const STATIC_CONF: ServeStaticModuleOptions = {
  rootPath: join(__dirname, "..", "public"),
};

export const CACHE_CONF: CacheModuleAsyncOptions = {
  isGlobal: true,
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => {
    const store = await redisStore({
      socket: {
        host: configService.get("REDIS_HOST"),
        port: +configService.get("REDIS_PORT"),
      },
    });
    return {
      store,
      // TTL em milissegundos — cache-manager v5 trabalha em ms (v3/v4 usavam segundos).
      ttl: 1000 * 60 * 60 * 24 * 7,
    };
  },
};

export const REDIS_CONF: SharedBullAsyncConfiguration = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService): BullRootModuleOptions => ({
    redis: {
      host: configService.get<string>("REDIS_HOST"),
      port: +configService.get("REDIS_PORT"),
    },
  }),
};

export const MONGO_CONF: ConnectOptions | any = {
  autoIndex: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectionFactory: (connection: any) => {
    connection.plugin(require("mongoose-autopopulate"));
    return connection;
  },
};

export const MONGO_ASYNC_CONF: MongooseModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    uri: configService.get<string>("MONGO_DSN"),
    ...MONGO_CONF,
  }),
};

export const PROVIDER: Provider[] = [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  AppService,
  TasksService,
  EncryptionService,
  BackupService,
];
