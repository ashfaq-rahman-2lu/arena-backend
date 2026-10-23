import { Module } from "@nestjs/common";
import { VisionProvider } from "./extraction.models";
import { ExtractionService } from "./extraction.service";
import { PaddleOcrVisionAdapter } from "./paddle-ocr-vision.adapter";
import {
  PaddleOcrProcessAdapter,
  OcrProcess,
} from "./paddle-ocr-process.adapter";
@Module({
  providers: [
    ExtractionService,
    { provide: VisionProvider, useClass: PaddleOcrVisionAdapter },
    { provide: OcrProcess, useClass: PaddleOcrProcessAdapter },
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
