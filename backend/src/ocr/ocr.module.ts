import { Global, Module } from '@nestjs/common';
import { METER_OCR_PROVIDER } from './meter-ocr-provider.interface';
import { MockMeterOcrProvider } from './mock-meter-ocr.provider';

// Прод-биндинг (Tesseract) меняется здесь, потребители не трогаются (ADR-0008).
@Global()
@Module({
  providers: [
    { provide: METER_OCR_PROVIDER, useClass: MockMeterOcrProvider },
  ],
  exports: [METER_OCR_PROVIDER],
})
export class OcrModule {}
