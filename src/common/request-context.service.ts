import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import { RequestContext, RequestCorrelation } from "./request-context.models";

@Injectable()
export class RequestContextService {
  private readonly storage: AsyncLocalStorage<RequestContext | null> =
    new AsyncLocalStorage<RequestContext | null>();

  current(): RequestContext | null {
    return this.storage.getStore() ?? null;
  }

  run<T>(context: RequestContext | null, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  identify(userId: string): void {
    const context = this.current();
    if (context) context.userId = userId;
  }

  correlation(): RequestCorrelation | null {
    const context = this.current();
    return context
      ? { requestId: context.requestId, userId: context.userId }
      : null;
  }

  withCorrelation<T>(
    correlation: RequestCorrelation | null,
    callback: () => T,
  ): T {
    return this.run(
      correlation ? { ...correlation, errorCode: null, errorType: null } : null,
      callback,
    );
  }
}
