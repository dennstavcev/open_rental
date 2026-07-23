import { Injectable } from '@nestjs/common';
import { MeterOcrProvider } from './meter-ocr-provider.interface';

// Заглушка OCR на время разработки: не распознаёт (возвращает null →
// пользователь вводит значение вручную). Реальный Tesseract (ADR-0008)
// заменит эту реализацию без изменений в потребителях.
@Injectable()
export class MockMeterOcrProvider implements MeterOcrProvider {
  async recognize(_image: Buffer): Promise<number | null> {
    return null;
  }
}
