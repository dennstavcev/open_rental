# SoftRent — backend

NestJS (ADR-0004), модульный монолит (ADR-0005), PostgreSQL + Prisma
(ADR-0003; выбор Prisma — CHANGELOG 2026-07-21). Структура модулей — 1:1
с разделом «Компоненты системы» `docs/ARCHITECTURE.md`.

Реализовано на текущий момент: модуль **Auth** (Phase 1, п.1), модуль
**Properties** — CRUD объектов + каталог на объекте (счётчики `Meter`,
услуги `Service`) (Phase 1, п.2), модуль **Leases** — договоры
(draft/sent/active) + приглашения арендатора + сканы с подписью и
активация; **Storage** — `StorageProvider`/`LocalFsStorageProvider`
(ADR-0007) (Phase 1, п.3); **Billing** — счета/период/статусы оплаты
(ADR-0012)/пени + показания счётчиков (OCR замокан) (Phase 1, п.4);
**Maintenance** — заявки + согласование суммы; **Messages** — чат по
договору (Phase 1, п.5); **Reports** — сводка собственника (Phase 1,
п.6); **Notifications** — `NotificationChannel` + persist + триггеры +
каскад напоминаний (Phase 1, п.7); роль **SuperAdmin** (удаление
переписки/документов); **Termination** — расторжение с пропорцией;
вложения к сообщениям и системное удаление.

## Локальный запуск

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL + Redis
npm install
npm run prisma:migrate        # применить схему к БД
npm run start:dev             # http://localhost:3000/api
```

Тесты не требуют БД (Prisma замокан):

```bash
npm test
```

## Эндпоинты Auth (`/api/auth`)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/register` | Регистрация (email, password, fullName) → пара токенов |
| POST | `/login` | Вход → пара токенов |
| POST | `/refresh` | Ротация refresh-токена → новая пара |
| POST | `/logout` | Отзыв refresh-токена |
| GET  | `/me` | Текущий пользователь (Bearer access-токен) |

Роль (собственник/арендатор) **не** задаётся при регистрации —
определяется по связям Property/Lease (`docs/ARCHITECTURE.md`, User).

## Эндпоинты Properties (`/api/properties`)

Все требуют Bearer access-токен; scoped к владельцу (создавший объект —
landlord для него).

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать объект (address, propertyType, areaSqm?, description?, timezone?) |
| GET  | `/` | Список своих объектов |
| GET  | `/:id` | Карточка своего объекта (чужой → 404) |
| PATCH | `/:id` | Частичное обновление своего объекта |

## Каталог на объекте (owner-scoped, Bearer)

Услуги — `/api/properties/:propertyId/services`:

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать услугу (name, price, serviceType: `monthly`\|`one_time`, description?) |
| GET  | `/` | Список услуг объекта |
| PATCH | `/:id` | Обновить услугу |
| DELETE | `/:id` | Удалить услугу |

Счётчики — `/api/properties/:propertyId/meters`:

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать счётчик (meterType: `electricity`\|`water`\|`gas`\|`heating`, name, tariff) |
| GET  | `/` | Список счётчиков объекта |
| PATCH | `/:id` | Обновить счётчик |

Показания счётчиков (`MeterReading`), фото объекта и вычисляемый статус —
следующие инкременты (см. `docs/CHANGELOG.md`).

## Договоры и приглашения (Bearer)

Договоры — landlord создаёт черновик под своим объектом, редактирует и
отправляет арендатору:

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/api/properties/:propertyId/leases` | landlord | Черновик договора (startDate, endDate, rentAmount, depositAmount, paymentDay 1–28, penaltyRatePercentPerDay) |
| GET  | `/api/leases` | landlord | Свои договоры |
| GET  | `/api/leases/:id` | landlord/tenant | Договор (виден landlord'у и привязанному арендатору) |
| PATCH | `/api/leases/:id` | landlord | Обновить черновик (только `draft`) |
| POST | `/api/leases/:id/send` | landlord | Отправить (`draft`→`sent`) + приглашение (invitedEmail) |

Приглашения — кабинет арендатора:

| Метод | Путь | Описание |
|---|---|---|
| GET  | `/api/invitations` | Мои приглашения в ожидании |
| POST | `/api/invitations/:id/accept` | Принять → привязка к договору |
| POST | `/api/invitations/:id/decline` | Отклонить |

### Сканы с подписью и активация (`/api/leases/:leaseId/signed-scans`)

Факт заключения договора — загрузка сканов подписанного документа обеими
сторонами (`docs/USER_FLOWS.md` §1.2). Хранение — через `StorageProvider`
(ADR-0007), в дев/тесте `LocalFsStorageProvider` (каталог `./uploads`).

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/` | landlord/tenant | Загрузить свой скан (multipart, поле `file`; JPEG/PNG/PDF, ≤10 МБ). Договор должен быть `sent`. Замена своего скана удаляет старый файл |
| GET  | `/` | landlord/tenant | Метаданные сканов договора |
| GET  | `/:scanId/file` | landlord/tenant | Скачать файл скана |

Когда сканы загружены **обеими** сторонами — договор автоматически
переходит `sent`→`active` (проверяется инвариант одного активного
договора на объект).

### Текст договора (`/api/leases/:leaseId/document`, Bearer)

Генерация текста договора по шаблону РФ (Handlebars, источник —
`dogovor_arendy.docx`); заполняются известные поля, паспортные данные —
прочерки для заполнения от руки на бумаге (в сервисе ПДн не хранятся).

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/` | landlord | Сгенерировать новую версию текста |
| GET  | `/` | landlord/tenant | Последняя версия (метаданные + `content`) |
| GET  | `/html` | landlord/tenant | Print-ready HTML (браузер → печать → PDF) |

PDF-рендер (Puppeteer) отложен — HTML print-ready
(см. `docs/CHANGELOG.md`).

## Биллинг (Bearer)

Счета по договору — черновик обновляется по ходу периода, финализируется
вручную только собственником (авто-планировщик отложён — см.
`docs/CHANGELOG.md`).

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET  | `/api/leases/:leaseId/bills` | landlord/tenant | Счета (с вычисленными пеней/просрочкой/суммой); лениво создаёт текущий черновик |
| POST | `/api/bills/:billId/line-items` | landlord | Добавить произвольную статью (только черновик) |
| POST | `/api/bills/:billId/finalize` | landlord | `draft`→`final` + черновик следующего периода (блок при непо́данных показаниях) |
| POST | `/api/bills/:billId/claim-paid` | tenant | «Я оплатил» → `payment_claimed` |
| POST | `/api/bills/:billId/confirm-paid` | landlord | «Оплата получена» → `paid` + `Payment` |
| POST | `/api/bills/:billId/waive-penalty` | landlord | Простить пеню (заморозка суммы) |

Пеня считается лениво (по дням просрочки, продолжает копиться в
`payment_claimed`, стоп в `paid`). «Просрочен» — вычисляемый флаг.

**Авто-переход периодов** (ADR-0013): `BillingScheduler` (`@nestjs/schedule`,
ежечасный `@Cron`) вызывает идемпотентный `runPeriodTransition` —
финализирует черновики с наступившей границей периода и создаёт следующий;
черновик без поданных показаний пропускается (дозреет позже). BullMQ/Redis
отложены (ADR-0013).

## Показания счётчиков (Bearer)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/meters/:meterId/readings` | Подать показание (multipart: `photo` JPEG/PNG обязательно + `confirmedValue`, `readingDate?`). OCR (`MeterOcrProvider`) в MVP замокан; валидация: новое ≥ предыдущего, мягкое предупреждение при расходе >10× среднего. Добавляет коммунальную строку в текущий черновик счёта |
| GET | `/api/leases/:leaseId/meters/:meterId/readings` | История показаний указанного договора для landlord/tenant, включая завершённый договор и отключённый счётчик |

Планировщик авто-периодов (BullMQ), реальный Tesseract OCR и уведомления
— следующие инкременты (см. `docs/CHANGELOG.md`).

## Заявки на обслуживание (Bearer)

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/api/leases/:leaseId/maintenance-requests` | tenant | Создать заявку (multipart: `category`, `description`, опц. `photo`) |
| GET  | `/api/leases/:leaseId/maintenance-requests` | landlord/tenant | Список заявок договора |
| PATCH | `/api/maintenance-requests/:id/status` | landlord | Статус `open`→`in_progress`→`resolved` |
| POST | `/api/maintenance-requests/:id/settlement` | landlord/tenant | Предложить сумму (`amount`, `payer`: `tenant`/`owner`/`split`) |
| POST | `/api/maintenance-requests/:id/settlement/confirm` | вторая сторона | Подтвердить → доля арендатора уходит строкой в счёт |

Сумма урегулирования применяется только по подтверждению **обеих**
сторон; доля арендатора: `tenant` — полностью, `split` — половина,
`owner` — 0. Расторжение (`termination`) — отдельный инкремент
(см. `docs/CHANGELOG.md`).

## Чат по договору (Bearer, без realtime — ADR-0009)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/leases/:leaseId/messages` | Отправить сообщение (`body`, `isOfficial?`) |
| GET  | `/api/leases/:leaseId/messages` | Лента сообщений договора |
| PATCH | `/api/messages/:id` | Редактировать своё сообщение (`body`) |

Удаление (только SuperAdmin), вложения и email-уведомления — отдельные
инкременты (см. `docs/CHANGELOG.md`).

## Отчёты (Bearer)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/reports/summary` | Сводка landlord: доходы (всего + по месяцам), задолженность/просрочки (контакт арендатора, дни, пеня), сроки договоров (30/60/90 дней) |

## Уведомления (Bearer)

`NotificationChannel` — интерфейс доставки; dev/тест — консольная
заглушка (`ConsoleNotificationChannel`), прод email/SMS — с хостингом.
Уведомления персистятся.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/notifications` | Мои уведомления |
| POST | `/api/notifications/:id/read` | Отметить прочитанным |

Событийные триггеры: «проверьте оплату» собственнику при claim (ADR-0012);
алерт обеим сторонам при пропуске периода из-за непо́данных показаний;
**каскад напоминаний** за 3 и за 1 день до оплаты (ежедневный `@Cron`) —
арендатору подать показания. Реальный email/SMS-провайдер — отложен
(с хостингом, см. `docs/CHANGELOG.md`).

## Расторжение договора (Bearer)

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/api/leases/:leaseId/termination-requests` | любая сторона | Заявка на расторжение (≥30 дней) |
| GET | `/api/leases/:leaseId/termination-requests` | стороны | Список заявок |
| POST | `/api/termination-requests/:id/finalize` | landlord | Финализировать → `terminated` + пропорция последнего счёта |

## Вложения и системное удаление (Bearer)

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| POST | `/api/leases/:leaseId/messages` | стороны | Сообщение с опц. вложением (multipart `attachment`) |
| GET | `/api/messages/:id/attachment` | стороны | Скачать вложение |
| DELETE | `/api/messages/:id` | **SuperAdmin** | Удалить сообщение (+ файл) |
| DELETE | `/api/lease-signed-scans/:id` | **SuperAdmin** | Удалить скан договора (+ файл) |
