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
| `/properties/[id]` | desktop | `6218f57653fb4b609e64c470c49b6cc9` | landlord, счётчики и услуги |
| `/properties/[id]` | mobile | `c2f3da74405042beaeffbff380ef15d5` | landlord, счётчики и услуги |
| `/leases/[id]/bills` | desktop | `b43fb20319cd49c09520e557ea031190` | landlord, просрочка + оплачен + черновик |
| `/leases/[id]/bills` | mobile | `c513088095084cc4b572c4bdc35599e1` | tenant, просрочка + оплачен |
| `/leases/[id]/meters` | desktop | `35d795643c9244278ddbd0424783cdeb` | tenant, внесено/ожидает/отключён |
| `/leases/[id]/meters` | mobile | `a6ca92c053304a1fbf3e27764e5f1a47` | tenant, внесено/ожидает/поверка/отключён |
| `/leases/[id]/meters/[meterId]/history` | mobile | `73d2334ffa534ae6b88bcdfc6914a5f6` | tenant, лента показаний (см. примечание о дрейфе) |
| `/leases/[id]/requests` | desktop | `8d27aaf39efb4f7f845931a052083510` | landlord, три статуса + урегулирование |
| `/leases/[id]/requests` | mobile | `e2513549ebee499c9cc16e1d9d833df4` | tenant, три статуса + урегулирование |
| `/leases/[id]/chat` | desktop | `b804a455300b48ad8da665e80dce9ebf` | landlord, с официальным сообщением и вложением |
| `/leases/[id]/chat` | mobile | `427ed73c60734fc08cbec02330a58ba4` | tenant, с официальным сообщением и вложением |
| `/leases/[id]/party-info` | desktop | `57c843c5d49a4fc3972e09eb3ce4c459` | landlord, сохранено + фокус на поле |
| `/leases/[id]/party-info` | mobile | `685ed750af76407a88eca810b40c13e1` | tenant, ошибка поля + повторное согласие |
| `/leases/[id]/termination` | desktop | `ad38669ebb6843f1827aca992bf0684a` | landlord, решение по заявке |
| `/leases/[id]/termination` | mobile | `fa22743f73af4b33aecfa0d03a98442d` | tenant, новая заявка + история |
| `/reports` | desktop | `48e5a40bebb24c959c6a0eec74070af2` | landlord, три таблицы |
| `/invitations` | mobile | `2833f1c109d04bc29546dc721b996eef` | tenant, два приглашения |
| `/invitations` | desktop | `326e83ac8ef84dc9a26ad49f68f7248b` | tenant, два приглашения |
| `/leases/[id]/meters/[meterId]/history` | desktop | `8de54c1c67aa4e39b74093fda0984a6e` | landlord, таблица подач |
| `/reports` | mobile | `60d3be010d18406981e559d95033be89` | landlord, карточки вместо таблиц |
| `/notifications` | mobile | `1d7854e4cae745e8a1a5a992755a8e96` | landlord, прочитанные и непрочитанные |
| `/notifications` | desktop | `33b4cc75bd674ecea2d63c8a8793767d` | landlord, лента + фильтры |
| `/onboarding` | mobile | `bf74ecdaf95d40d39d095c0cde614bd0` | шаг 3 из 5, полоса прогресса |
| `/onboarding` | desktop | `44ffac85e4c043ecb71cc6f4f19a12c3` | шаг 3 из 5, список шагов слева |
| `/legal/privacy` | desktop | `ceaa1ccc757d455695031410fd6fb92d` | публичная, колонка 720px |
| `/legal/privacy` | mobile | `43c4e0a74e964c939a63f6144a80a9cf` | публичная, одна колонка |
| `/` | mobile | `079bdb1ca8504eaba1cb474ac8b120c7` | сплэш загрузки |
| `/` | desktop | `93c32c35d9cf45f9a58b8a7d11267d89` | сплэш загрузки |

Листы состояний (не экраны приложения, а спека для переноса в код):

| Лист | Устройство | Screen ID | Что на нём |
|---|---|---|---|
| Пустые состояния | desktop | `be230723e20d48498028bd3a75c6d5da` | 6 плиток: /properties, bills, meters, requests, /notifications, /invitations |
| Загрузка и ошибки | desktop | `a5113c99fcc146c4b315ddd8c2b695a6` | скелетон списка, скелетон таблицы, инлайновая ошибка, ошибка поля, успех |

Заменённые (не использовать при переносе в код):
- `1f2f8d5862a348d5a6930deb7ea6bd06` — `/dashboard` desktop v1, нарушал
  правило акцента (фиолетовый hero) и был на английском.
- `a24fa648bcb443d8bd047e38b4ed7680` — `/dashboard` mobile v1, неверный
  набор пунктов нижней навигации.

Вспомогательное:
- `d1009c365478446093aa90a19ca627d7` — интерьерное фото (ассет фона
  экранов входа), не экран.

## Примечание о дрейфе дизайн-системы

При генерации `/leases/[id]/meters/[meterId]/history` (mobile) Stitch
завёл в проекте **вторую** дизайн-систему — `assets/78fb6f233a0d4089b45783b9bef8cb33`
(«SoftRent Digital Ledger»), хотя вызов явно указывал залоченную
`assets/5695572871459613897`. Отличия: фон `#fff8f3` вместо `#fbf6ec`,
roundness EIGHT вместо TWELVE, colorVariant FIDELITY.

Экран оставлен: визуально он соответствует конституции (тёплая база,
терракота на суммах, фиолетовый только в активной навигации), а
источником токенов при переносе в код служит `.stitch/DESIGN.md`, а не
объект дизайн-системы в Stitch. Но при любой доработке этого экрана
через `edit_screens` нужно проверять, что он не утащил за собой чужие
токены, и при генерации новых экранов всегда передавать
`assets/5695572871459613897` явно.

## Мелочи, которые чинятся при переносе в код, а не перегенерацией

- Словомарка в сайдбаре местами отрисована как «SoftRent», местами как
  «SOFTRENT». Канон — заглавными, как на экранах входа.
- Счётчик уведомлений в сайдбаре Stitch рисует красным кружком. В коде —
  нейтральная пилюля: красный зарезервирован под просрочку и ошибки.
- На листе «Пустые состояния» подзаголовок ушёл в латиницу
  («Developer Reference Sheet»). Это служебный лист, в продукт он не
  попадает, но при копировании текстов брать русский вариант.
- В макете `/legal/privacy` в разделе «Оператор» Stitch подставил
  выдуманное «ООО СофтРент». Реальный оператор (ИП или самозанятый) ещё
  не определён — юридический текст готовится отдельно, из макета его не
  копировать.
