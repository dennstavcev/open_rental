# Состояние разработки (точка возобновления)

> Обновлено: 2026-07-22. Файл — «где остановились», чтобы продолжить в
> новой сессии без потери контекста. История решений — `docs/CHANGELOG.md`,
> статусы — `docs/ROADMAP.md`, решения — `docs/adr/`.

## Что уже сделано

### Backend (`backend/`) — NestJS, модульный монолит, Prisma + PostgreSQL

Phase 1 функционально закрыт целиком. Модули:

- **auth** — регистрация/вход, JWT access+refresh, argon2, `SuperAdminGuard`.
- **properties / services / meters** — объект + каталог услуг + счётчики.
- **meters/readings** — показания (фото + OCR-заглушка), валидация, → строка в счёт.
- **leases** — договор (draft→sent→active→terminated), `Invitation`,
  `LeaseSignedScan` (активация по 2 сканам), `LeaseDocument` (генерация
  текста РФ из `dogovor_arendy.docx`, Handlebars → HTML).
- **billing** — `Bill` (draft/final), статусы оплаты (ADR-0012), пени
  (ленивый расчёт), прощение, планировщик периодов (`@nestjs/schedule`,
  ADR-0013), каскад напоминаний.
- **maintenance** — заявки + двустороннее согласование суммы → счёт.
- **messages** — чат по договору, вложения, удаление (SuperAdmin).
- **reports** — сводка собственника (доходы/просрочки/сроки).
- **notifications** — `NotificationChannel` (консоль-заглушка) + persist + триггеры.
- **tenant-info** — паспортные ПДн, шифрование AES-256-GCM (`CryptoService`),
  доступ только tenant/SuperAdmin.
- **termination** — расторжение (30 дней, финализирует landlord, пропорция).

Тесты: `npm test` в `backend/` — **118/118 зелёные** (Prisma замокан, БД не нужна).
Сборка: `npx nest build` — чистая.

### Frontend (`frontend/`) — Next.js (App Router, TS)

Экраны: `/login`, `/register`, `/properties`, `/properties/[id]`
(счётчики/услуги/показания), `/leases`, `/leases/[id]` (текст/сканы/
активация/отправка), `/leases/[id]/bills`, `/leases/[id]/chat`,
`/leases/[id]/requests`, `/leases/[id]/tenant-info`,
`/leases/[id]/termination`, `/invitations`, `/reports`, `/notifications`.
Auth: токены в localStorage + auto-refresh (`lib/api.ts`), `AuthProvider`.

Сборка: `npm run build` в `frontend/` — **проходит** (15 маршрутов).
UI — функциональный placeholder (дизайн-спеки `designer` не подключены).

## Как запустить / проверить

```bash
# backend
cd backend && npm install && npm test          # тесты без БД
npx nest build                                  # сборка
# для реального запуска нужен Postgres: docker compose up -d + npm run prisma:migrate

# frontend
cd frontend && npm install && npm run build     # сборка/типизация
```

## Что осталось (не сделано намеренно)

**Frontend:** все экраны MVP сделаны (включая онбординг-мастер
`/onboarding`). Осталась только визуальная доводка по дизайн-спекам
`designer` (UI сейчас — функциональный placeholder).

**Инфраструктура:**
- ✅ Локальное окружение поднято: `docker compose up -d` (Postgres 16 +
  Redis 7), миграция `init` применена (18 таблиц). Для повторного старта
  окружения: `cd backend && docker compose up -d` (`.env` уже есть).
- ✅ **Первый E2E-прогон против реальной БД пройден** (регистрация →
  объект → договор → активация → счёт → оплата → отчёт; ПДн-шифрование
  и доступ проверены). См. `docs/CHANGELOG.md`.
- Запуск backend: `cd backend && npm run start:prod` (или `start:dev`).
  Frontend — на другом порту (оба по умолчанию :3000).
- Дальше (привязано к хостингу/152-ФЗ, отложено):
- Реальные провайдеры вместо заглушек: email/SMS (`NotificationChannel`),
  S3-хранилище (`StorageProvider`), Tesseract OCR (`MeterOcrProvider`).
- PDF-рендер договора (сейчас print-ready HTML; Puppeteer отложен).
- Фоновая задача ретеншена ПДн (автоудаление через 3 года).
- BullMQ/Redis для планировщика (сейчас `@nestjs/schedule`, ADR-0013).

## Рекомендуемый следующий шаг

Либо доделать оставшиеся фронт-экраны (TenantInfo + расторжение +
онбординг-мастер), либо поднять инфраструктуру (docker-compose + миграции)
для первого реального E2E-прогона фронт↔бэкенд.
