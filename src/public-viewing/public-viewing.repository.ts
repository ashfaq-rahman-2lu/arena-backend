import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class PublicViewingRepository {
  constructor(private readonly database: DatabaseService) {}
  async checkDatabase(): Promise<void> {
    await this.database.$queryRaw`SELECT 1`;
  }
}
