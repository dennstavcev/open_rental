# Реестр экранов Stitch (R1)

Рабочий артефакт редизайна (ADR-0023). Project: `9694110487873573027`,
design system: `assets/5695572871459613897`. Удаляется вместе с
`docs/REDESIGN_BRIEF.md` после мержа `redesign/stitch`.

Правка через `edit_screens` иногда создаёт НОВЫЙ screen id, иногда правит
существующий по месту — поэтому здесь всегда записан актуальный id, а
устаревшие помечены как заменённые.

| Маршрут | Устройство | Screen ID | Состояние |
|---|---|---|---|
| `/login` | mobile | `939dd5a363894cb1a53628016217fdb9` | обычное (фото-фон + frost) |
| `/login` | desktop | `5db12294b1354eb59bddd634c3013cf9` | обычное + фокус на поле |
| `/dashboard` | desktop | `daebb7c9b8b541b0a23b39ca5108816c` | landlord, с данными |
| `/dashboard` | mobile | `8ce29fbde45642158b48ce3ee6da7310` | landlord, с данными |
| `/leases/[id]` | desktop | `e3fad7f474734bd8a6561e63abfc0248` | landlord, статус «Действует» |
| `/leases/[id]` | mobile | `6f27cfe1a58b47f5a1296759121cfdfa` | landlord, статус «Действует» |
| `/register` | mobile | `f84bf76d64224300b7f9d4021904e4a6` | обычное (фото-фон + frost) |
| `/register` | desktop | `1d54497700e3413abf7de16a69a51f41` | обычное |
| `/properties` | desktop | `f809e95021044ccdb393330320a0aff2` | landlord, таблица с данными |
| `/properties` | mobile | `d21c49094ea643fe97e3c56133124b39` | landlord, список с данными |

Заменённые (не использовать при переносе в код):
- `1f2f8d5862a348d5a6930deb7ea6bd06` — `/dashboard` desktop v1, нарушал
  правило акцента (фиолетовый hero) и был на английском.
- `a24fa648bcb443d8bd047e38b4ed7680` — `/dashboard` mobile v1, неверный
  набор пунктов нижней навигации.

Вспомогательное:
- `d1009c365478446093aa90a19ca627d7` — интерьерное фото (ассет фона
  экранов входа), не экран.
