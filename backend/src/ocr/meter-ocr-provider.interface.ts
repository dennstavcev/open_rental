// Абстракция OCR показаний счётчика (ADR-0008). Реальный движок — Tesseract
// (self-hosted) — подключается позже той же абстракцией; в MVP-разработке —
// MockMeterOcrProvider (см. docs/CHANGELOG.md).
export const METER_OCR_PROVIDER = Symbol('METER_OCR_PROVIDER');

export interface MeterOcrProvider {
  // Возвращает распознанное значение или null, если распознать не удалось.
  // Значение всегда подтверждается/правится пользователем перед сохранением.
  recognize(image: Buffer): Promise<number | null>;
}
