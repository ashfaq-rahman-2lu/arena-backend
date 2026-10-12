import { Injectable } from "@nestjs/common";
export abstract class HttpTransport {
  abstract send(url: string, options: RequestInit): Promise<Response>;
}
@Injectable()
export class FetchHttpAdapter extends HttpTransport {
  send(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}
