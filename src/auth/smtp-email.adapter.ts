import { Injectable, OnModuleDestroy } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";
import { ApplicationError } from "../common/application-error";
import { ConfigurationService } from "../config/configuration.service";
import { EmailMessage } from "./auth.models";
export abstract class EmailPort {
  abstract send(message: EmailMessage): Promise<void>;
}
@Injectable()
export class SmtpEmailAdapter extends EmailPort implements OnModuleDestroy {
  private readonly transport: Transporter | null;
  private readonly from: string;
  constructor(config: ConfigurationService) {
    super();
    const smtp = config.values.smtp;
    this.from = smtp?.from ?? "";
    this.transport = smtp
      ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          ...(smtp.user && smtp.password
            ? { auth: { user: smtp.user, pass: smtp.password } }
            : {}),
        })
      : null;
  }
  async send(message: EmailMessage): Promise<void> {
    if (!this.transport)
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Email delivery is not configured",
      );
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch {
      throw new ApplicationError(
        "INTEGRATION_UNAVAILABLE",
        503,
        "Could not deliver email. Please retry.",
      );
    }
  }
  onModuleDestroy(): void {
    this.transport?.close();
  }
}
