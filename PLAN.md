# PLAN — Фаза 13: доставка приглашения и покрытие триггеров уведомлений

> Источник задачи — `docs/DEV_STATE.md`, «Фаза 13» и «Рекомендуемый следующий
> шаг», п. 1. Предыдущий PLAN.md (Фазы 33/34) закрыт коммитом `c159bfb` и
> полностью заменяется этим файлом.
>
> **Ревизия 2 (2026-08-27, после первого раунда адверсариального ревью).**
> Изменено по итогам: заведён ADR-0035 (публичный lookup по токену — новая
> поверхность раскрытия, отказ от ADR был необоснован); найдена и включена в
> скоуп **существующая утечка токена арендатору** через `GET /invitations`;
> дедупликация чата переведена с «findFirst → create» на partial unique index,
> потому что прежняя версия противоречила собственному критерию приёмки;
> пометка чата прочитанным переведена с «один раз за монтирование» на «после
> каждой удачной загрузки», иначе сообщения, пришедшие при открытом чате,
> оставались непрочитанными навсегда; из тел уведомлений убран весь свободный
> пользовательский текст (`category` — строка без `MaxLength`); `type` в
> `POST /notifications/read` ограничен серверным allowlist'ом; номера строк
> заменены на имена символов.
>
> **Ревизия 3 (2026-08-27, две правки по ходу реализации — изменение скоупа,
> фиксируется явно).** `SettlementPayer` имеет третье значение `split`,
> которого формулировка «платит арендатор/собственник» не покрывала: тело
> уведомления перестроено на «Кто платит: {ярлык}» и заведена константа
> `PAYER_LABEL` (B4.2). В F2 `??` заменено на `||`: незаданная переменная
> окружения приходит пустой строкой, и `??` не дал бы обещанного отката на
> `window.location.origin`.
>
> **Миграция БД одна** — `Notification.leaseId` + partial unique index. Как
> изменение модели данных фиксируется в `docs/ARCHITECTURE.md`.

## Решения владельца (интервью 2026-08-27)

| № | Вопрос | Решение |
|---|---|---|
| 1 | Что такое «ссылка-приглашение» | `/register?invite=<token>` — форма регистрации с подставленным и заблокированным email. Привязка по email сохраняется, токен пропуском **не** является |
| 2 | Частота уведомления о сообщении в чате | Не более **одного непрочитанного** `message_new` на договор на получателя |
| 3 | Где виден индикатор нового сообщения | Точка на вкладке «Чат» внутри договора **и** строка на «Сегодня» |

## Сквозные правила

1. **Уведомляем только контрагента, никогда — инициатора действия.**
2. **Тело уведомления не содержит ни свободного пользовательского текста, ни
   ПДн.** Ни текста сообщения чата, ни `category`/`description` заявки, ни
   ФИО. Причина: в Фазе 14 (ADR-0030) тот же `body` уйдёт письмом через
   внешний SMTP, а `category` — строка без ограничения длины и содержимого
   (`CreateMaintenanceDto` — только `@IsString @MinLength(1)`). Допустимы:
   суммы, даты, названия статусов из enum.
3. **Каждый новый `notify()` получает `leaseId`.**
4. **Сбой уведомления не ломает основную операцию** — реализуется один раз
   внутри `NotificationsService`, вызывающий код `try/catch` не дублирует.
5. Тексты — на русском, в тон существующим (`billing.service.ts`,
   `leases.service.ts` → `acceptInvitation`).

## Явно вне скоупа (зафиксировано, не молчим)

Первый раунд ревью вскрыл дефекты, **существующие до Фазы 13**. Они реальны,
но чинить их здесь — расползание скоупа; каждый нужно занести в
`docs/DEV_STATE.md` как находку, а не исправлять:

- гонка `proposeSettlement` / `confirmSettlement`: propose делает безусловный
  update после чтения снимка, поэтому сумма в заявке и в созданной услуге
  могут разойтись;
- `termination.finalize` не защищён от двойной финализации (нет условного
  `updateMany ... where status: pending`), и `applyTermination` вызывается уже
  после коммита — при его падении договор остаётся `terminated` без
  последнего счёта;
- `acceptInvitation` / `declineInvitation` читают приглашение, затем делают
  безусловный update — параллельные приём и отказ могут разойтись;
- отсутствие rate limiting во всём приложении (в `app.module.ts` нет
  `ThrottlerModule`) — закрыто production-гейтом ADR-0031;
- отсутствие outbox/повторной доставки уведомлений: если процесс упадёт между
  созданием сообщения и созданием уведомления, событие теряется навсегда.
  Семантика доставки в этой фазе — **at-most-once, best-effort**; это
  сознательный выбор для внутрибазового журнала, пересматривается вместе с
  реальным каналом в Фазе 14.

## Состав

| № | Пункт | Где |
|---|---|---|
| A0 | ADR-0035 — публичный lookup приглашения по токену | docs/adr |
| B1 | Миграция `Notification.leaseId` + partial unique index | backend/prisma |
| B2 | `NotifyInput.leaseId`, `notifyOncePerLease`, best-effort | backend |
| B3 | `POST /notifications/read` | backend |
| B4 | Триггеры: чат, обслуживание, расторжение, отклонение приглашения | backend |
| B5 | Токен landlord'у, публичный lookup, **закрытие утечки токена арендатору** | backend |
| F1 | API-клиенты и событие обновления | frontend/lib |
| F2 | Кнопка «Скопировать ссылку» | frontend |
| F3 | `/register?invite=<token>` | frontend |
| F4 | Точка на вкладке «Чат» | frontend |
| F5 | Пометка прочитанным при открытом чате | frontend |
| F6 | Строка «Новое сообщение в чате» на «Сегодня» | frontend |
| D1 | Документация | docs |

---

## A0. ADR-0035 — публичный lookup приглашения по токену

**Заводится до реализации** (`CLAUDE.md`: решение без записи в документации
считается незавершённым). Файл
`docs/adr/0035-public-invitation-lookup-by-token.md` + строка в
`docs/adr/README.md`.

Причина, по которой ADR всё-таки нужен: до Фазы 13 незалогиненный человек не
мог получить из сервиса **ничего**. Публичный
`GET /invitations/by-token/:token` — новая поверхность, раскрывающая email
приглашённого и адрес объекта любому держателю ссылки. Это меняет периметр
раскрытия ПДн (ADR-0021), а значит требует записанного решения, даже если
модель доступа к самому договору не меняется.

Содержание ADR:

- **Решение:** токен приглашения используется только для предзаполнения формы
  регистрации; приём приглашения по-прежнему привязан к email (ADR-0020).
  Публичный эндпоинт отдаёт ровно два поля — `invitedEmail` и
  `propertyAddress`.
- **Принятые риски (перечислить прямо, не смягчая):** токен попадает в URL, а
  значит в историю браузера, буфер обмена, скриншоты и access-логи обратного
  прокси; «не писать в логи» на уровне приложения этого не отменяет. Держатель
  ссылки узнаёт email и адрес. Компенсации: токен — `randomUUID()` (122 бита),
  любое непригодное состояние даёт одинаковый 404, ответ помечен
  `Cache-Control: no-store`, ссылка перестаёт работать при отзыве
  приглашения.
- **Сознательно отложено:** TTL токена, хранение токена в хешированном виде,
  ротация и явный отзыв по компрометации. Обосновать: приглашение и так живёт
  до первого `send()` заново или до `cancelInvitation`, а хеширование ломает
  показ ссылки собственнику. Пересмотреть вместе с email-каналом (Фаза 14).

---

## B1. Миграция

`backend/prisma/schema.prisma`, модель `Notification`:

```prisma
model Notification {
  id        String    @id @default(uuid())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  // Договор, к которому относится событие: нужен для дедупликации
  // (одно непрочитанное «новое сообщение» на договор) и для бейджа у
  // нужного договора. Nullable — уведомления вне договора и все
  // созданные до Фазы 13 остаются без привязки.
  lease     Lease?    @relation(fields: [leaseId], references: [id], onDelete: Cascade)
  leaseId   String?
  type      String
  title     String
  body      String
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([userId, leaseId, type, readAt])
  @@map("notifications")
}
```

В модели `Lease` добавить обратную связь `notifications Notification[]`.

**`onDelete: Cascade` — обоснование, а не аналогия.** Уведомление «новое
сообщение по договору X» после удаления договора X ведёт в никуда: ссылка
битая, действие невыполнимо. `SetNull` оставил бы в журнале строки без
адресата и сломал бы дедупликацию (все осиротевшие строки схлопнулись бы в
одну группу `leaseId = NULL`). Каскад выбран сознательно; удаления `Lease` в
продукте сейчас нет вообще — оно появится в Фазе 16 и должно будет свериться
с этим решением.

**Порядок создания миграции строго такой** — обычный `migrate dev` применяет
миграцию сразу, и дописанный после этого SQL сломает checksum:

```
npx prisma migrate dev --create-only --name add_notification_lease
# дописать индекс в сгенерированный migration.sql
npx prisma migrate dev
```

Дописываемый вручную partial unique index:

```sql
-- Не больше одного непрочитанного «новое сообщение» на пару
-- (получатель, договор). Индекс, а не проверка в коде: findFirst + create
-- неатомарны, и два одновременных сообщения создавали бы две записи.
-- Ограничение узкое, по одному типу: другим типам уведомлений
-- дублирование не запрещено (две смены статуса заявки — два события).
CREATE UNIQUE INDEX "notifications_unread_message_per_lease"
  ON "notifications" ("userId", "leaseId")
  WHERE "readAt" IS NULL AND "type" = 'message_new';
```

Требования: поле nullable, backfill не делается, существующие строки не
меняются. Проект жёстко на PostgreSQL (`provider = "postgresql"`), partial
index допустим. Индекс не имеет представления в `schema.prisma` — на
зафиксированной в lock-файле Prisma 5.22 schema differ его игнорирует и
последующие `migrate dev` его не дропают; **при обновлении Prisma это
поведение перепроверить** (записать в `docs/ARCHITECTURE.md` вместе с самим
индексом).

---

## B2. `NotificationsService`

`backend/src/notifications/notifications.service.ts`.

1. `NotifyInput` — добавить `leaseId?: string`, прокинуть в
   `prisma.notification.create`.

2. `notify()` — `try/catch` расширить с доставки в канал на **всю** операцию,
   включая `prisma.notification.create`. Тип результата становится
   `Promise<Notification | null>`, при ошибке — `this.logger.warn(...)` и
   `null`.

   Существующие вызывающие (`billing.service.ts` ×2, `leases.service.ts`,
   `lease-return-act.service.ts`, `lease-signed-scans.service.ts`,
   `party-info.service.ts`) возвращаемое значение не используют — смена типа
   их не ломает. Если TypeScript где-то ругнётся, чинить по месту, поведение
   не менять.

3. Новый метод — дедупликация опирается на индекс из B1, а не на чтение:

```ts
// Уведомление, которое не повторяется, пока предыдущее не прочитано.
// Инвариант держит partial unique index из миграции
// add_notification_lease: попытка создать второе непрочитанное
// message_new по тому же договору падает с P2002, и это штатный
// исход, а не ошибка.
//
// Весь метод — best-effort (сквозное правило 4): ни чтение, ни запись
// не имеют права уронить операцию, которая его вызвала.
async notifyOncePerLease(
  userId: string,
  leaseId: string,
  input: NotifyInput,
): Promise<Notification | null> {
  try {
    return await this.notifyOrThrow(userId, { ...input, leaseId });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return null; // непрочитанное уже есть — это и есть цель
    }
    this.logger.warn(`Не удалось создать уведомление: ${String(err)}`);
    return null;
  }
}
```

   Для этого выделить приватный `notifyOrThrow(userId, input)` — тело
   нынешнего `notify()` без внешнего `try/catch` (доставка в канал внутри
   по-прежнему в своём `try/catch`), а публичный `notify()` сделать его
   глушащей обёрткой. Так `notify` и `notifyOncePerLease` разделяют одну
   реализацию, и P2002 отличим от прочих ошибок.

4. Новый метод для B3:

```ts
// Пометить прочитанными уведомления пользователя по договору.
// Фильтр по userId — сама авторизация: чужие строки под updateMany не
// попадают ни при каком leaseId. Проверка членства в договоре
// намеренно не делается: пользователь распоряжается собственными
// строками журнала, и запрет на это не защищает никого.
async markLeaseRead(
  userId: string,
  leaseId: string,
  type?: string,
): Promise<{ count: number }> {
  const { count } = await this.prisma.notification.updateMany({
    where: { userId, leaseId, readAt: null, ...(type ? { type } : {}) },
    data: { readAt: new Date() },
  });
  return { count };
}
```

---

## B3. `POST /notifications/read`

Новый файл `backend/src/notifications/dto/mark-lease-read.dto.ts`:

```ts
// Клиент не управляет внутренней таксономией уведомлений: помечать
// прочитанным можно только то, что у него есть поверхность прочитать.
// Список расширяется вместе с такой поверхностью, не раньше.
export const MARKABLE_TYPES = ['message_new'] as const;

export class MarkLeaseReadDto {
  @IsUUID()
  leaseId!: string;

  @IsIn(MARKABLE_TYPES)
  type!: (typeof MARKABLE_TYPES)[number];
}
```

`type` **обязателен**: без него один запрос гасил бы по договору всё подряд,
включая «подтвердите оплату», хотя пользователь всего лишь открыл чат.

`notifications.controller.ts` — добавить:

```ts
@Post('read')
@HttpCode(HttpStatus.OK)
markLeaseRead(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: MarkLeaseReadDto,
): Promise<{ count: number }> {
  return this.notifications.markLeaseRead(user.id, dto.leaseId, dto.type);
}
```

Несуществующий `leaseId` → `{ count: 0 }`, не 404.

---

## B4. Триггеры `notify()`

### B4.1. Чат — `messages.service.ts`

`messages.module.ts`: добавить `NotificationsModule` в `imports`.

В `send()`: результат `this.leases.getForUser(userId, leaseId)` сейчас
выбрасывается — захватить его в `const lease`. `prisma.message.create` →
`const message`. После создания:

```ts
// Уведомляем вторую сторону, не автора. Текст сообщения в тело не
// попадает: в Фазе 14 это же тело уйдёт письмом через внешний SMTP.
const recipientId =
  lease.landlordId === userId ? lease.tenantId : lease.landlordId;
if (recipientId) {
  await this.notifications.notifyOncePerLease(recipientId, leaseId, {
    type: 'message_new',
    title: 'Новое сообщение',
    body: 'В чате по договору появилось новое сообщение.',
  });
}
return message;
```

**Edge cases:** `tenantId === null` → пропускаем; расторгнутый договор — чат
работает намеренно (коммит `6a725d2`), уведомление создаётся; `edit()`
уведомления не порождает.

### B4.2. Обслуживание — `maintenance.service.ts`

`maintenance.module.ts`: добавить `NotificationsModule`.

Все тела — **без `category` и `description`** (сквозное правило 2).

| Метод | Кому | `type` | `title` | `body` |
|---|---|---|---|---|
| `create` | `lease.landlordId` | `maintenance_created` | `Новая заявка на обслуживание` | `Арендатор создал заявку — откройте раздел «Заявки».` |
| `updateStatus` | `lease.tenantId` | `maintenance_status` | `Статус заявки изменён` | `Новый статус: {ярлык}.` |
| `proposeSettlement` | контрагент | `maintenance_settlement_proposed` | `Предложена сумма по заявке` | `Сумма: {amount} ₽. Кто платит: {ярлык плательщика}.` |
| `confirmSettlement`, частичная ветка | контрагент | `maintenance_settlement_confirmed` | `Сумма по заявке подтверждена` | `Ждём подтверждения второй стороны.` |
| `confirmSettlement`, применение | контрагент | `maintenance_settlement_applied` | `Сумма по заявке согласована` | `{amount} ₽ — сумма попадёт в счёт.` |

Ярлыки — две константы рядом с `ALLOWED_PHOTO`:

```ts
const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  resolved: 'Решена',
};

// Строчными: подставляется в середину предложения. Значения совпадают по
// смыслу с PAYER_LABEL из frontend/lib/maintenance.ts — при изменении
// править обе стороны.
const PAYER_LABEL: Record<SettlementPayer, string> = {
  tenant: 'арендатор',
  owner: 'собственник',
  split: 'пополам',
};
```

`SettlementPayer` имеет **три** значения (`tenant | owner | split`) —
формулировка «платит арендатор/собственник» третий случай не покрывает,
поэтому тело построено как «Кто платит: {ярлык}», что грамматично для всех
трёх.

Контрагент: `const other = lease.tenantId === userId ? lease.landlordId : lease.tenantId;`
— при `null` уведомление пропускается.

**Edge cases:**

- `updateStatus` уведомляет **только если статус изменился**. Проверять не
  сравнением со считанным снимком (два параллельных одинаковых запроса —
  практически двойной клик — оба увидят старое значение и оба уведомят), а
  **условным атомарным обновлением**:

  ```ts
  const { count } = await this.prisma.maintenanceRequest.updateMany({
    where: { id: request.id, status: { not: status } },
    data: { status },
  });
  // count === 0 → статус уже был таким, уведомлять не о чем
  ```

  и уведомлять при `count === 1`. Метод по-прежнему обязан вернуть
  `MaintenanceRequest`, поэтому после `updateMany` дочитать запись —
  **`findUniqueOrThrow`, а не `findUnique`**: `null` нарушил бы сигнатуру
  `Promise<MaintenanceRequest>`, а при конкурентном удалении заявки честный
  бросок лучше молчаливого `null`. Тот же приём уже применён в существующем
  коде `confirmSettlement` (там `findUnique` + явный `NotFoundException`) —
  допустимы оба варианта, лишь бы `null` не утекал наружу;
- ветка `resolved` c неоплаченной услугой уходит через
  `billing.resolveRequestWithService` и возвращается оттуда — уведомление
  обязано срабатывать в **обеих** ветках; вынести за общий `return`, не
  дублировать. **В этой ветке условное обновление не применяется**: статус
  проставляет биллинг, и переписывать его контракт ради устранения
  дублирующего уведомления при двойном клике — несоразмерно. Остаточный
  риск: два параллельных перевода в `resolved` по заявке с неоплаченной
  услугой дадут два уведомления. Принято сознательно, записать в
  `docs/DEV_STATE.md` вместе с прочими находками ревью;
- `confirmSettlement`, **частичная** ветка — тем же приёмом. Вместо
  `update` + сравнение со снимком:

  ```ts
  const { count } = await this.prisma.maintenanceRequest.updateMany({
    where: {
      id: request.id,
      settlementAppliedAt: null,
      OR: [
        { confirmedByTenant: { not: confirmedByTenant } },
        { confirmedByLandlord: { not: confirmedByLandlord } },
      ],
    },
    data: { confirmedByTenant, confirmedByLandlord },
  });
  ```

  уведомлять при `count === 1`, затем дочитать запись **`findUniqueOrThrow`**
  (или `findUnique` + явный `NotFoundException`, как уже сделано ниже по
  файлу) и вернуть её — `null` наружу не отдавать ни при каком исходе. Без
  условного обновления сторона, повторно вызывая confirm, безнаказанно
  спамит контрагента: код просто переписывает уже установленный флаг;
- `confirmSettlement`, ветка **применения** — уведомление строго после
  коммита транзакции и только при `claimed.count === 1`. Для этого
  транзакция должна вернуть `{ updated, applied: claimed.count === 1 }`;
  уведомить снаружи, вернуть `updated`;
- неактивный договор во всех трёх методах уже отбивается
  `ConflictException` — до `notify` управление не доходит.

### B4.3. Расторжение — `termination.service.ts`

`termination.module.ts`: добавить `NotificationsModule`.

| Метод | Кому | `type` | `title` | `body` |
|---|---|---|---|---|
| `create` | контрагент инициатора | `termination_requested` | `Заявка на расторжение` | `Дата расторжения — {dd.mm.yyyy}. Инициатор: {арендатор\|собственник}.` |
| `finalize` | `lease.tenantId` | `termination_finalized` | `Договор расторгнут` | `Договор завершён {dd.mm.yyyy}. Проверьте последний счёт и возврат депозита.` |

`reason` в тело **не попадает** — свободный текст.

**Edge cases:** в `finalize` уведомлять **после** `billing.applyTermination`,
иначе переход по уведомлению опережает появление последнего счёта;
`lease.tenantId` проверить на `null`.

Формат даты — **`dd.mm.yyyy`** (как в таблице выше и как принято в русском
интерфейсе проекта). Собрать вручную, без новых зависимостей, например
разложив `toISOString().slice(0, 10)` на части и переставив их —
`toISOString()` сам по себе даёт `yyyy-mm-dd` и в тело не подставляется.
Завести локальный хелпер в `termination.service.ts`, а не дублировать
выражение в двух местах.

### B4.4. Отклонение приглашения — `leases.service.ts`

В `declineInvitation` использовать `Invitation`, уже возвращённый
`getPendingInvitationFor` (второй запрос за приглашением не делать), добрать
договор `findUnique({ where: { id: invitation.leaseId }, select: { id: true, landlordId: true } })`
и уведомить landlord'а:

```
type: 'invitation_declined'
title: 'Приглашение отклонено'
body: 'Арендатор отклонил приглашение — измените условия и отправьте снова.'
leaseId: invitation.leaseId
```

Симметрично: существующему `notify` в `acceptInvitation` добавить
`leaseId: lease.id`.

---

## B5. Ссылка-приглашение

### B5.0. Закрыть существующую утечку токена (в скоуп добавлено ревью)

`listMyInvitations` возвращает `invitations.map(({ lease, ...invitation }) => ({ ...invitation, ... }))`
— спред кладёт в ответ **весь** Prisma-объект `Invitation`, включая `token`.
Тип `InvitationView = Invitation & {...}` это узаконивает. То есть
приглашённый арендатор уже сегодня получает токен по `GET /invitations`, и
фронтовый интерфейс, где `token` не описан, ничего не защищает.

Сегодня это безвредно (токен нигде не используется). После B5.2 токен станет
значимым, поэтому чинится **в этой же фазе, до** появления lookup-эндпоинта:

- `InvitationView` перестаёт наследовать всю модель: заменить
  `Invitation & {...}` на явный список полей — `id`, `leaseId`,
  `invitedEmail`, `status`, `createdAt` + существующие `landlord`,
  `property`, `lease`;
- в `listMyInvitations` заменить спред на явную выборку полей;
- проверить, не сломался ли `frontend/lib/leases.ts` → `Invitation` (там
  `token` не описан, поэтому не должен).

### B5.1. Токен собственнику — только для действующего приглашения

`LeaseInvitationView` — добавить `token: string | null`.

`toLeaseView` берёт последнее приглашение независимо от статуса, поэтому
токен отдаётся **только** при `latest.status === InvitationStatus.pending`,
иначе `null`. Отозванный/отклонённый/принятый токен по API не ходит.

Само поле кладётся **внутрь уже существующей ветки** `lease.landlordId === userId`
(«Историю приглашений видит только тот, кто их отправлял») — не рядом с ней.

### B5.2. Публичный lookup

Метод в `LeasesService`:

```ts
export interface InvitationByTokenView {
  invitedEmail: string;
  propertyAddress: string;
}

// Публичный (без авторизации) минимум для экрана регистрации по ссылке.
// Ровно два поля: email — чтобы предзаполнить форму, адрес — чтобы
// человек понял, о каком объекте речь. Ни сумм, ни ФИО, ни id договора:
// эндпоинт открыт всем, у кого есть ссылка (ADR-0035).
async getInvitationByToken(token: string): Promise<InvitationByTokenView> {
  const invitation = await this.prisma.invitation.findUnique({
    where: { token },
    include: { lease: { select: { property: { select: { address: true } } } } },
  });
  if (!invitation || invitation.status !== InvitationStatus.pending) {
    throw new NotFoundException('Приглашение не найдено или уже недействительно');
  }
  return {
    invitedEmail: invitation.invitedEmail,
    propertyAddress: invitation.lease.property.address,
  };
}
```

Новый контроллер `backend/src/leases/invitation-link.controller.ts`:

```ts
// Отдельный контроллер, потому что InvitationsController закрыт
// JwtAuthGuard на уровне класса, а эта ссылка по определению
// открывается незалогиненным человеком.
@Controller('invitations')
export class InvitationLinkController {
  constructor(private readonly leases: LeasesService) {}

  @Get('by-token/:token')
  @Header('Cache-Control', 'no-store')
  byToken(@Param('token') token: string): Promise<InvitationByTokenView> {
    return this.leases.getInvitationByToken(token);
  }
}
```

Зарегистрировать в `leases.module.ts` в массиве `controllers`.

**Требования безопасности:**
- `Cache-Control: no-store` обязателен: ответ содержит email и адрес, кэш
  браузера/прокси их сохранять не должен;
- любое непригодное состояние (`cancelled`/`accepted`/`declined`/нет такого
  токена) → **один и тот же** 404 с одним и тем же текстом; различать
  причины нельзя;
- токен остаётся `randomUUID()` v4 — не менять, не укорачивать;
- **на уровне класса не должно быть ни одного guard'а** — это проверяется
  тестом, а не глазами.

---

## F1. API-клиенты и событие обновления

`frontend/lib/leases.ts`:
- `Lease.invitation.token: string | null`;
- новая функция:

```ts
export interface InvitationByToken {
  invitedEmail: string;
  propertyAddress: string;
}

export function getInvitationByToken(token: string): Promise<InvitationByToken> {
  return apiFetch<InvitationByToken>(
    `/invitations/by-token/${encodeURIComponent(token)}`,
  );
}
```

`frontend/lib/notifications.ts`:
- `Notification.leaseId: string | null`;
- `markLeaseRead(leaseId: string, type: string): Promise<{ count: number }>` —
  `POST /notifications/read`, `type` теперь обязателен.

`frontend/lib/events.ts` — по образцу `INVITATIONS_CHANGED`:

```ts
export const NOTIFICATIONS_CHANGED = 'softrent:notifications-changed';

export function notifyNotificationsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
```

`frontend/components/AppShell.tsx` — подписать `refreshUnread` на
`NOTIFICATIONS_CHANGED` тем же паттерном, что уже применён к
`INVITATIONS_CHANGED`. Без этого бейдж «Уведомления» висит до следующего
30-секундного опроса после того, как чат пометил всё прочитанным.

---

## F2. Кнопка «Скопировать ссылку»

`frontend/app/leases/[id]/page.tsx`, существующий блок
`<Section title="Приглашение">`, рядом с `<Fact label="Отправлено на" …>`.

База ссылки — **сначала явная переменная окружения, потом origin**:

```tsx
const [origin, setOrigin] = useState('');
// Именно `||`, а не `??`: незаданная переменная в .env приходит пустой
// строкой, а `??` подменяет только null/undefined и оставил бы ''.
useEffect(
  () => setOrigin(process.env.NEXT_PUBLIC_APP_URL || window.location.origin),
  [],
);
const inviteLink =
  origin && lease?.invitation?.token
    ? `${origin}/register?invite=${lease.invitation.token}`
    : '';
```

`NEXT_PUBLIC_APP_URL` нужен потому, что за обратным прокси или на
preview-развёртывании `window.location.origin` даёт адрес, по которому
арендатор не пройдёт. Добавить переменную в `frontend/.env.example` (или
аналог, если он в проекте называется иначе) с комментарием и пустым
значением по умолчанию — при пустом значении поведение прежнее.

Дальше:
- показать ссылку моноширинным блоком с `break-all`, доступную для ручного
  выделения, и кнопку «Скопировать ссылку»;
- копирование — **через существующий `copyText` из `@/lib/clipboard`**,
  повторив паттерн из `frontend/app/leases/[id]/bills/page.tsx` (функция
  `copy`): при неудаче `setError('Не удалось скопировать — выделите ссылку вручную')`,
  при удаче — отметка «Скопировано» на 1.5 с;
- пока `origin` пуст — кнопка `disabled`;
- **условие видимости самой `<Section title="Приглашение">` не менять** —
  оно остаётся прежним (`isLandlord && lease.status === 'sent' && lease.invitation`).
  Сузить его до `status === 'pending'` нельзя: у отклонённого приглашения
  договор остаётся в статусе `sent`, а внутри этой секции живут
  **единственные** элементы управления «Изменить адрес» и «Отозвать». Спрятав
  её, мы отняли бы у собственника возможность переотправить приглашение
  ровно в том сценарии, ради которого Фаза 13 добавила уведомление
  «Приглашение отклонено — измените условия и отправьте снова»;
- на `status === 'pending'` завязан **только новый блок со ссылкой**: он
  рендерится при непустом `inviteLink` (`token` для прочих статусов уже
  `null`, так что отдельная проверка статуса не нужна);
- подпись «Арендатор ещё не принял приглашение» для отклонённого приглашения
  вводит в заблуждение — заменить текст по фактическому статусу: для
  `declined` сказать, что арендатор отклонил приглашение и его можно
  отправить заново на тот же или другой адрес;
- подпись: «Отправьте её арендатору любым удобным способом — почтой,
  мессенджером. Ссылка привязана к указанному адресу почты.»

---

## F3. `/register?invite=<token>`

`frontend/app/register/page.tsx`.

**Обязательно:** `useSearchParams()` в App Router требует границы `Suspense`
— иначе сборка падает на пререндере. Разбить на `RegisterInner` (вся текущая
логика) и экспорт по умолчанию, оборачивающий его в
`<Suspense fallback={null}>`.

Состояние приглашения различает **три** исхода, а не два:

```
token = useSearchParams().get('invite')
invite: null | 'loading' | { invitedEmail, propertyAddress } | 'not-found' | 'unavailable'

getInvitationByToken(token)
  → успех                       : данные
  → ApiError со status === 404  : 'not-found'
  → любая другая ошибка         : 'unavailable'
```

Разделять обязательно: сетевой сбой или 500 — это не «ссылка недействительна»,
и врать про это пользователю нельзя.

| Состояние | Поле email | Что на экране |
|---|---|---|
| токена нет | как сейчас | — |
| `loading` | заблокировано, пустое | «Проверяем приглашение…» |
| данные | `readOnly`, заполнено | «Приглашение на {propertyAddress}» над формой |
| `not-found` | обычное | «Ссылка-приглашение недействительна или уже использована. Зарегистрироваться можно обычным способом.» |
| `unavailable` | обычное | «Не удалось проверить приглашение — попробуйте позже или зарегистрируйтесь обычным способом.» + кнопка «Повторить» |

Прочее:
- `readOnly`, **не** `disabled`: `disabled`-поле не уходит в отправку формы и
  ломает `required`;
- после успешного `register()`: при валидном приглашении
  `router.replace('/invitations')`, иначе прежний `/dashboard`;
- при валидном приглашении подпись внизу — «Уже есть аккаунт? Войдите —
  приглашение будет ждать в разделе «Приглашения».», ссылка остаётся на
  `/login`; **экран логина в этой фазе не трогаем**;
- существующая подпись «Роль не выбирается…» при валидном приглашении
  скрывается — в этом сценарии она дезинформирует.

**Ссылку открыл уже залогиненный пользователь** — обрабатывается явно, а не
объявляется «осознанным умолчанием». Если `useAuth()` даёт пользователя:
- **email совпадает** с `invitedEmail` → сразу `router.replace('/invitations')`,
  форма регистрации не показывается;
- **email не совпадает** → форму регистрации не показывать; показать
  сообщение «Вы вошли как {email текущего}. Это приглашение адресовано
  другому адресу — выйдите и откройте ссылку снова.» с кнопкой «Выйти»
  (`logout()` из `useAuth`). Адрес объекта и email приглашённого в этом
  случае **не показывать**: незачем раскрывать их постороннему аккаунту.

**Гонка отзыва приглашения** между загрузкой формы и регистрацией не
закрывается (токен может стать `cancelled` в этом промежутке). Последствие:
пользователь зарегистрируется и попадёт на `/invitations`, где увидит
существующее пустое состояние. Это принято; критерий приёмки сформулирован
соответственно.

---

## F4. Точка на вкладке «Чат»

`frontend/components/LeaseTabs.tsx`. Компонент читает уведомления сам —
прокидывать флаг через шесть экранов договора хуже.

**Собственного опроса не заводить.** `AppShell` уже опрашивает уведомления
раз в 30 с; второй независимый поллер на том же экране удваивал бы запросы
без пользы. `LeaseTabs` загружает список **один раз при монтировании** и
далее только по событию `NOTIFICATIONS_CHANGED`:

```tsx
const [unreadChat, setUnreadChat] = useState(false);
const refresh = useCallback(async () => {
  const notes = await listNotifications().catch(() => []);
  setUnreadChat(
    notes.some((n) => !n.readAt && n.leaseId === id && n.type === 'message_new'),
  );
}, [id]);
useEffect(() => { void refresh(); }, [refresh]);
useEffect(() => {
  window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
}, [refresh]);
```

Следствие, которое надо принять сознательно: точка может отставать до
следующей навигации между вкладками договора. Для индикатора «есть что
посмотреть» этого достаточно, а лишнего трафика он не создаёт.

Отрисовка — у вкладки «Чат», **кроме** случая, когда пользователь уже на ней
(`pathname === chatHref`): там всё гасит F5.

```tsx
{tab.href === chatHref && unreadChat && pathname !== chatHref && (
  <>
    <span aria-hidden className="ml-2 inline-block size-2 rounded-full bg-violet-500 align-middle" />
    <span className="sr-only">есть новые сообщения</span>
  </>
)}
```

Точка **без числа**: дедупликация даёт максимум одно уведомление, считать
нечего.

---

## F5. Пометка прочитанным при открытом чате

`frontend/app/leases/[id]/chat/page.tsx`.

Пометка выполняется **после каждой удачной загрузки**, а не один раз за
монтирование. Причина: `usePolling(load, 15000)` продолжает подтягивать
сообщения, пока чат открыт, и уведомление о сообщении, пришедшем через минуту
после открытия, при однократной пометке осталось бы непрочитанным навсегда —
пользователь видит сообщение на экране, а бейдж горит.

Встроить в конец `load()`, после успешного `setMessages`:

```tsx
// Чат открыт — значит его уведомления прочитаны. Вызывается на каждом
// цикле опроса: сообщение, пришедшее при открытом экране, тоже должно
// гасить бейдж. Событие шлём только когда что-то реально погасло, иначе
// каждые 15 секунд впустую дёргаем AppShell и LeaseTabs.
try {
  const { count } = await markLeaseRead(id, 'message_new');
  if (count > 0) notifyNotificationsChanged();
} catch {
  /* косметика: следующий цикл опроса попробует снова */
}
```

**Принятые последствия (не молчим):**
- сообщение может прийти между `listMessages()` и `markLeaseRead()` — тогда
  уведомление погаснет, хотя сообщение ещё не отрисовано. Окно ≤ 15 с, и
  следующий цикл опроса покажет сообщение пользователю, который смотрит
  ровно на этот экран. Read-cursor по `messageId` ради этого не вводим;
- POST раз в 15 с на одном экране — цена корректной семантики; при `count = 0`
  он не порождает ни одного дополнительного запроса на клиенте.

---

## F6. Строка «Новое сообщение в чате» на «Сегодня»

`frontend/app/dashboard/page.tsx`. Уведомления там **уже загружаются** —
дополнительных запросов не нужно.

1. В цикле по `leases` добавить:

```tsx
if (notes.some((n) => !n.readAt && n.leaseId === l.id && n.type === 'message_new')) {
  acts.push({
    key: `chat-${l.id}`,
    icon: MessageSquare,
    title: 'Новое сообщение в чате',
    subtitle: place,
    href: `/leases/${l.id}/chat`,
  });
}
```

`MessageSquare` добавить в импорт из `lucide-react`.

2. **Обобщённая строка «N непрочитанных уведомлений» перестаёт считать чат.**
   Сейчас она берёт `notes.filter((x) => !x.readAt).length`; заменить на
   подсчёт с исключением `type === 'message_new'`, и саму строку не
   добавлять, если после исключения счётчик обнулился. Иначе одно событие
   даёт два действия на одном экране — одно ведёт в чат, другое в журнал, и
   исчезают они в разные моменты.

3. Строка добавляется для договоров **в любом статусе**, включая
   `terminated`: чат после расторжения работает намеренно (коммит `6a725d2`).
   Это единственное действие «Сегодня», не ограниченное `sent`/`active` — так
   и задумано.

4. Секция «Договоры» **не меняется**: слот `value` в `Row` занят
   `LeaseStatusPill`.

---

## D1. Документация

В одном коммите с кодом (ADR-0035 из A0 — до реализации):

1. `docs/adr/0035-public-invitation-lookup-by-token.md` + строка в
   `docs/adr/README.md`. **Заодно** починить существующую опечатку индекса:
   строка ADR-0031 в таблице продублирована дважды — удалить вторую.
2. `docs/CHANGELOG.md` — запись за 2026-08-27: ссылка-приглашение, ADR-0035,
   закрытие утечки токена арендатору, покрытие триггеров, дедупликация чата,
   бейджи; отдельной строкой — смена статуса Фазы 13.
3. `docs/DEV_STATE.md` — Фаза 13 в «закрыта»; «Рекомендуемый следующий шаг»
   переписать (п. 1 → Фазы 15 и 17); **добавить раздел с находками ревью**,
   перечисленными выше в «Явно вне скоупа», чтобы гонки не потерялись;
   обновить дату в заголовке.
4. `docs/ROADMAP.md` — в пункте «Базовые уведомления» перечислить добавленные
   триггеры, снять формулировку про молчащие события; отметить, что доставка
   приглашения ссылкой закрыта, а email-канал остаётся за Фазой 14.
5. `docs/ARCHITECTURE.md` — `Notification.leaseId`, partial unique index и
   правило «одно непрочитанное `message_new` на договор».

Если при реализации всплывёт решение за рамками описанного — остановиться и
вернуть вопрос, а не принимать молча.

---

## Тесты

Правки существующих спек: `messages.service.spec.ts`,
`maintenance.service.spec.ts`, `termination.service.spec.ts`,
`leases.service.spec.ts`, `notifications.service.spec.ts`.

Обязательный минимум новых проверок:

**Уведомления**
1. `notifyOncePerLease` создаёт запись, когда непрочитанных нет.
2. `notifyOncePerLease` возвращает `null` и не пробрасывает ошибку, когда
   Prisma бросает `P2002` (сработал partial unique index).
3. `notifyOncePerLease` возвращает `null` и не пробрасывает ошибку при любой
   другой ошибке БД.
4. После `markLeaseRead` следующий `notifyOncePerLease` снова создаёт запись.
5. `markLeaseRead` не трогает уведомления другого пользователя по тому же
   договору.
6. `MarkLeaseReadDto` отвергает `type`, которого нет в `MARKABLE_TYPES`.

**Триггеры**
7. `messages.send` уведомляет вторую сторону и **не** уведомляет автора.
8. `messages.send` возвращает сообщение и не падает, когда уведомление
   бросило исключение (глушение живёт в сервисе уведомлений, а не в тесте).
9. `maintenance.updateStatus` молчит, когда условный `updateMany` вернул
    `count === 0` (статус уже был целевым).
10. `maintenance.confirmSettlement` в частичной ветке молчит при
    `count === 0` (повторное подтверждение той же стороной).
11. `maintenance.confirmSettlement` уведомляет один раз при
    `claimed.count === 1` и ни разу при `0`.
12. `termination.finalize` уведомляет арендатора **после**
    `applyTermination` (проверяется порядком вызовов моков).
13. `declineInvitation` уведомляет landlord'а.
14. Ни одно тело уведомления, порождённое `maintenance`/`termination`, не
    содержит `category`, `description` или `reason` — проверить прямым
    assert'ом на переданном в `notify` объекте.

**Границы раскрытия**
15. `getInvitationByToken` возвращает ровно `{ invitedEmail, propertyAddress }`
    для `pending` и бросает 404 для `cancelled`/`accepted`/`declined`/
    несуществующего — **с одинаковым сообщением**.
16. `toLeaseView` отдаёт `invitation.token` собственнику для `pending`,
    `null` для остальных статусов и `invitation === null` арендатору.
17. `listMyInvitations` **не** содержит поля `token` в результате (регрессия
    на закрытую в B5.0 утечку).
18. На `InvitationLinkController` отсутствует метаданные guard'а
    (`Reflect.getMetadata('__guards__', InvitationLinkController)` пусто) —
    проверка, что публичный эндпоинт не унаследовал `JwtAuthGuard` случайно.

---

## Критерии приёмки

- [ ] `npx prisma migrate dev` проходит; миграция добавляет nullable
      `leaseId`, составной индекс и partial unique index; существующие
      строки не изменены.
- [ ] `cd backend && npm run build && npm test` — зелено.
- [ ] `cd frontend && npm run build && npx tsc --noEmit` — зелено. (`npm run
      lint` из критериев убран: ESLint в проекте не установлен вообще — ни
      пакета, ни конфига, — и `next lint` открыл бы интерактивный мастер.
      Заводить линтер — отдельная задача, не часть Фазы 13.)
- [ ] ADR-0035 заведён и внесён в `docs/adr/README.md`; дубль строки ADR-0031
      в индексе убран.
- [ ] Собственник на экране договора со статусом `sent` видит ссылку
      `/register?invite=<token>` и копирует её одной кнопкой; при отказе
      буфера обмена показывается сообщение, а не тишина.
- [ ] `token` отсутствует в ответе `/leases/:id` для арендатора, в ответе
      `/invitations` для кого угодно и в `/leases/:id` для собственника,
      когда приглашение не `pending`.
- [ ] Публичный `GET /invitations/by-token/:token` отвечает без авторизации,
      отдаёт только два поля, ставит `Cache-Control: no-store` и даёт
      одинаковый 404 на все непригодные состояния.
- [ ] Открытие ссылки незалогиненным даёт форму регистрации с заблокированным
      подставленным email и адресом объекта; после регистрации пользователь
      попадает на `/invitations`. Если приглашение отозвали в промежутке, он
      видит штатное пустое состояние, а не ошибку.
- [ ] Открытие ссылки с отозванным токеном даёт предупреждение
      «недействительна» и рабочую обычную регистрацию; при недоступном
      backend — другое сообщение и кнопка «Повторить», а не ложное
      «недействительна».
- [ ] Открытие ссылки залогиненным: при совпадении email — редирект на
      `/invitations`; при несовпадении — предложение выйти, без показа email
      приглашённого и адреса объекта.
- [ ] Три **последовательных** сообщения от одной стороны создают одно
      уведомление; после того как получатель открыл чат, следующее сообщение
      создаёт новое. Два **одновременных** сообщения тоже дают одно —
      инвариант держит partial unique index, а не проверка в коде.
- [ ] Сообщение, пришедшее при открытом чате, гасит бейдж в течение одного
      цикла опроса, без перезагрузки страницы.
- [ ] Точка на вкладке «Чат» появляется у получателя и гаснет после открытия
      чата.
- [ ] Строка «Новое сообщение в чате» появляется на «Сегодня» и ведёт прямо в
      чат нужного договора; обобщённая строка «N непрочитанных» чат больше не
      считает.
- [ ] Создание заявки, смена её статуса, предложение и согласование суммы,
      создание и финализация расторжения, отклонение приглашения — каждое
      порождает уведомление **контрагенту** и ни одного — инициатору.
      Повторный вызов, не меняющий состояние, не порождает ничего.
- [ ] Ни одно тело уведомления не содержит текста сообщения чата,
      `category`, `description`, `reason` или ПДн.
- [ ] Находки ревью, оставленные вне скоупа, записаны в `docs/DEV_STATE.md`.
