import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ConfigurationService } from "../config/configuration.service";
@Injectable()
export class DatabaseService
  extends PrismaClient<
    import("@prisma/client").Prisma.PrismaClientOptions,
    "query"
  >
  implements OnModuleDestroy
{
  constructor(configuration: ConfigurationService) {
    super({
      datasourceUrl: configuration.values.databaseUrl,
      log: [{ emit: "event", level: "query" }],
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
