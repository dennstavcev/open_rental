# OPENRENT — frontend

Next.js (App Router, TypeScript), клиентская часть стека (ADR-0001/0003).

Реализовано: Auth (регистрация/вход, JWT access+refresh, auth-context);
объекты (`/properties` — список/создание, `/properties/[id]` — счётчики,
услуги, подача показаний); договоры (`/leases` — список/создание
черновика, `/leases/[id]` — детали, отправка приглашения, генерация
текста договора, загрузка подписанных сканов и авто-активация);
`/invitations` — кабинет арендатора (принять/отклонить);
`/leases/[id]/bills` — счета (формирование, статьи, «Я оплатил»/«Оплата
получена»/прощение пени); `/leases/[id]/chat` — чат (официальные,
вложения); `/leases/[id]/requests` — заявки (статусы, согласование
суммы); `/reports` — сводка собственника; `/notifications` — уведомления
(счётчик непрочитанных в шапке); `/leases/[id]/termination` —
расторжение. UI —
функциональный placeholder (дизайн-спеки `designer` уточняются отдельно).

## Запуск

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL → backend /api
npm install
npm run dev                        # http://localhost:3000 (backend — на 3000/api)
```

> Backend слушает `:3000` с префиксом `/api`. Для локальной разработки
> фронта запускайте его на другом порту (`PORT=3001 npm run dev` во
> frontend) или измените порт backend.

## Структура

- `lib/api.ts` — fetch к API с автообновлением access-токена по refresh.
- `lib/auth.tsx` — `AuthProvider`/`useAuth` (login/register/logout, `/auth/me`).
- `components/RequireAuth.tsx` — клиентский гард приватных экранов.
- `app/login`, `app/register`, `app/properties`, `app/leases`,
  `app/leases/[id]`, `app/invitations` — экраны.
- `lib/properties.ts`, `lib/leases.ts` — типизированные вызовы API.

## Статус

`next build` проходит (типизация + компиляция). Против живого backend не
запускалось (нет локальной БД в среде) — E2E при поднятой инфраструктуре.
