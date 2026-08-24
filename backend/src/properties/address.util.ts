// Единственное место сборки адресной строки (ADR-0026). Кеш
// Property.address пересобирается только здесь.
export function formatPropertyAddress(input: {
  city?: string | null;
  street?: string | null;
  house?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
}): string | null {
  const normalize = (value: string | null | undefined): string | null => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  };

  const city = normalize(input.city);
  const street = normalize(input.street);
  const house = normalize(input.house);
  if (!city || !street || !house) {
    return null;
  }

  const parts = [`г. ${city}`, `ул. ${street}`, `д. ${house}`];
  const optionalParts: Array<[string, string | null]> = [
    ['стр.', normalize(input.building)],
    ['эт.', normalize(input.floor)],
    ['кв.', normalize(input.apartment)],
  ];
  for (const [prefix, value] of optionalParts) {
    if (value) {
      parts.push(`${prefix} ${value}`);
    }
  }
  return parts.join(', ');
}
