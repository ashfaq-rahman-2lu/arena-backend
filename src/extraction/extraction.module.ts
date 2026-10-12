import { Module } from "@nestjs/common";
import { VisionProvider } from "./extraction.models";
import { ExtractionService } from "./extraction.service";
import { OpenAIVisionAdapter } from "./open-ai-vision.adapter";
@Module({
  providers: [
    ExtractionService,
    { provide: VisionProvider, useClass: OpenAIVisionAdapter },
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
