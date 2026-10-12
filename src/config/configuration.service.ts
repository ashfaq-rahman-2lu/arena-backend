import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApplicationConfiguration } from "./configuration";
@Injectable()
export class ConfigurationService {
  readonly values: ApplicationConfiguration;
  constructor(config: ConfigService<{ arena: ApplicationConfiguration }>) {
    this.values = config.getOrThrow<ApplicationConfiguration>("arena");
  }
}
