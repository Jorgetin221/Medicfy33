import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { mustGetEnv } from "../config/must-get-env";

// Connects as medicfy_app (APP_DATABASE_URL), never as the schema
// owner — see the Sprint 0 append-only proof and CLAUDE.md R1.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: { db: { url: mustGetEnv("APP_DATABASE_URL") } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
