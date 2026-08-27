# Architecture Decision Records

ADR — короткий документ, фиксирующий одно архитектурное/техническое
решение и его обоснование. Один файл = одно решение.

## Список

| № | Заголовок | Статус |
|---|---|---|
| [0001](0001-web-app-format.md) | Формат реализации — веб-приложение | Принято |
| [0002](0002-agent-team-structure.md) | Агентная command-and-control структура разработки | Принято |
| [0003](0003-stack-choice.md) | Выбор стека — React/Next.js + Node/Python + PostgreSQL | Принято |
| [0004](0004-backend-framework.md) | Backend-фреймворк — NestJS | Принято |
| [0005](0005-modular-monolith.md) | Модульный монолит | Принято |
| [0006](0006-auth-mechanism.md) | Аутентификация — email+пароль, собственный JWT | Принято |
| [0007](0007-file-storage-abstraction.md) | Файловое хранилище — интерфейс + локальная реализация | Принято (частично — провайдер/хостинг отдельно) |
| [0008](0008-ocr-engine-meter-readings.md) | OCR-движок для показаний счётчика — Tesseract | Принято |
| [0009](0009-realtime-chat-not-required-mvp.md) | Realtime для чата не обязателен в MVP | Принято |
| [0010](0010-add-designer-role.md) | Добавление роли `designer` в агентную команду | Принято |
| [0011](0011-payment-bill-future-acquiring-readiness.md) | Готовность Payment/Bill под будущий эквайринг (СБП) | Устарело (заменено ADR-0029) |
| [0012](0012-payment-confirmation-nominal-flow.md) | Подтверждение оплаты — номинальный флоу (без эквайринга) | Принято |
| [0013](0013-mvp-scheduler-nestjs-schedule.md) | Планировщик периодов в MVP — @nestjs/schedule (BullMQ отложен) | Принято |
| [0014](0014-meter-model-extension.md) | Расширение модели Meter — серийный номер, отключение, начальное показание | Принято |
| [0015](0015-tenant-meter-readings-screen.md) | Экран показаний для арендатора + метрологическая поверка | Принято (граница доступа к истории уточнена ADR-0034) |
| [0016](0016-app-wide-polling-sync.md) | Синхронизация данных между сторонами — polling по всему приложению | Принято |
| [0017](0017-no-pii-in-lease-contract.md) | Договор не содержит персональных данных сторон — вне периметра 152-ФЗ | Устарело (заменено ADR-0021) |
| [0018](0018-lease-handover-act.md) | Акт приёма-передачи имущества как Приложение №1 к договору | Принято (флоу активации уточнён ADR-0032) |
| [0019](0019-payment-proof-and-payout-details.md) | Подтверждение оплаты — чек от арендатора и реквизиты арендодателя | Принято |
| [0020](0020-invitation-visibility-and-today-hub.md) | Приглашение видно отправителю, стороны видят друг друга, главная — «Сегодня» | Принято |
| [0021](0021-lease-party-personal-data.md) | Сбор и хранение персональных данных сторон договора (обе стороны) — отменяет ADR-0017 | Принято (активация и ретеншен уточнены ADR-0032/0033) |
| [0022](0022-party-info-frontend-and-consent.md) | Фронт персональных данных сторон и версионируемое согласие | Принято |
| [0023](0023-visual-redesign-tailwind-stitch.md) | Полный визуальный редизайн — Tailwind + shadcn/ui, источник макетов Stitch | Принято |
| [0024](0024-readings-deadline-and-status.md) | Срок подачи показаний и статус обязанности по счёту | Принято |
| [0025](0025-maintenance-to-service-to-bill.md) | Заявка на обслуживание → разовая услуга → счёт | Принято |
| [0026](0026-structured-property-address.md) | Структурированный адрес объекта и кадастровый номер | Принято |
| [0027](0027-inventory-return-act.md) | Акт возврата имущества и вычет ущерба из депозита | Принято |
| [0028](0028-landlord-portfolio-view.md) | Портфель объектов в отчёте собственника | Принято |
| [0029](0029-subscription-only-monetization.md) | Монетизация — только подписка, без эквайринга аренды | Принято |
| [0030](0030-email-channel-self-hosted-postfix.md) | Email-канал уведомлений — self-hosted Postfix | Принято |
| [0031](0031-production-deployment-contour.md) | Production-контур — Docker Compose, immutable-образы, SSH-деплой | Принято |
| [0032](0032-activation-requires-signed-document-and-party-info.md) | Активация договора требует подписанного текста и ПДн | Принято |
| [0033](0033-pii-retention-deletes-lease-document.md) | Ретеншен ПДн удаляет весь LeaseDocument | Принято |
| [0034](0034-meter-reading-history-lease-scoped-access.md) | История показаний счётчика — доступ по договору, не только активному | Принято |
| [0035](0035-public-invitation-lookup-by-token.md) | Публичный поиск приглашения по токену | Принято |

## Как завести новый ADR

1. Скопировать `0000-template.md` в `NNNN-краткое-название.md`
   (номер по порядку, kebab-case).
2. Заполнить разделы: Контекст, Решение, Последствия.
3. Добавить строку в таблицу выше.
4. Добавить запись в `docs/CHANGELOG.md`.

Полные правила — `docs/DOCUMENTATION_RULES.md`.
