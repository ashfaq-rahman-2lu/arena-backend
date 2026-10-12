import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ConfigurationService } from "../config/configuration.service";
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(configuration: ConfigurationService) {
    super({ datasourceUrl: configuration.values.databaseUrl });
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
