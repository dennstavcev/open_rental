# PLAN — «Пункт 0»: три фикса безопасности вне очереди

> Источник задачи — `docs/DEV_STATE.md`, раздел «Рекомендуемый следующий шаг»,
> пункт 0. Владелец продукта подтвердил скоуп 2026-08-25: в этот заход берём
> ровно три фикса, Фазу 13 и остальное — следующим заходом.
>
> Решения уже приняты, новых ADR заводить не нужно:
> - **A** — Фаза 34, authz финализации счёта (без ADR, «чинить не откладывая»);
> - **B** — Фаза 33 в части ADR-0034 (история показаний — доступ по `leaseId`);
> - **C** — Фаза 25 / находка A-24 по ADR-0033 (ретеншен удаляет `LeaseDocument`).
>
> Ревизия 3 (2026-08-25, после двух раундов адверсарного ревью плана):
> добавлен пункт **C2** (гард на регенерацию документов после ретеншена) —
> без него C ничего не гарантирует; добавлен **B2** (та же утечка через
> `lastReadingValue` в хабе счётчиков); добавлена отсрочка ретеншена по
> `TerminationRequest`, которую требует ADR-0021, но код никогда не
> реализовывал; уточнены транзакционный контракт, расчёт срока, тестовые
> моки и проверка маршрутов.
>
> Миграции схемы БД не требуются ни для одного из пунктов.
> Всё остальное из Фаз 33/34/25 (сортировка счетов, двухшаговое подтверждение
> аномалии, архивная навигация, экран «мои данные») — **вне скоупа**.

---

## A. Финализация счёта — только собственник (Фаза 34)

### Проблема

`backend/src/billing/billing.service.ts:135-143` — `finalize()` вызывает
`getBillAsParty()`, поэтому арендатор может финализировать чужой черновик
(воспроизведено прямым API-вызовом, `200`). Комментарий над методом
(`billing.service.ts:133-134`, «кнопка доступна обеим сторонам») закрепляет
ошибочное поведение. Фронт показывает кнопку обеим сторонам
(`frontend/app/leases/[id]/bills/page.tsx:331-341`).

### Backend

- `backend/src/billing/billing.service.ts`, метод `finalize`: заменить
  `this.getBillAsParty(userId, billId)` на `this.getBillAsLandlord(userId, billId)`.
  При чужом/несуществующем счёте — `NotFoundException('Счёт не найден')` (404,
  не 403: не раскрываем существование счёта; это согласовано с остальными
  landlord-only операциями биллинга, `billing.service.ts:913`). Арендатор
  своего же договора тоже получает 404 — осознанно.
- Обновить комментарий над методом: финализация доступна только собственнику;
  сослаться на Фазу 34 (`docs/DEV_STATE.md`).
- `getBillAsParty` остаётся используемым (`billing.service.ts:424` — путь
  арендатора). Другие его вызовы **не трогать**.
- Автоматическая финализация планировщиком (`runPeriodTransition`,
  `finalizeBill`) не затрагивается — она не проходит через `finalize()`.

### Frontend

- `frontend/app/leases/[id]/bills/page.tsx`: обернуть кнопку «Сформировать счёт»
  в `isLandlord && …` (переменная уже есть, `page.tsx:55`). Внешний вид для
  собственника не меняется; лишний пустой фрагмент `<>…</>` можно убрать.
- Арендатору в состоянии `draft` кнопок действий не остаётся — это ожидаемо.
  Поясняющий текст для арендатора **не добавлять** (это часть Фазы 34 про
  подписи, вне скоупа).

### Тесты (backend, `billing.service.spec.ts`, блок `describe('finalize')`)

- `finalize` арендатором договора → `NotFoundException`, и **ни один write-путь
  не задет**: не вызваны `prisma.$transaction`, `prisma.bill.updateMany`,
  `prisma.bill.create`. (Реальная финализация пишет через
  `tx.bill.updateMany` + создание следующего черновика внутри той же
  транзакции — `billing.service.ts:251,254,270`; проверка только `bill.update`
  ничего не доказывает.)
- Существующие положительные кейсы собственника (`billing.service.spec.ts:140-190`)
  должны остаться зелёными без правки ожиданий.

---

## B. История показаний счётчика — доступ по договору (Фаза 33, ADR-0034)

### Проблема

`backend/src/meters/meter-readings.service.ts`, `listForMeter()` ищет
**активный** договор объекта и отдаёт показания этого договора, игнорируя
`leaseId` из URL фронта. Отсюда два дефекта ADR-0034: 404 собственнику после
расторжения и показ истории активного договора A по URL завершённого договора C.

### Backend — сервис

`backend/src/meters/meter-readings.service.ts`:

- Заменить `listForMeter(userId, meterId)` на
  `listForLeaseMeter(userId: string, leaseId: string, meterId: string): Promise<MeterReading[]>`.
- Порядок проверок:
  1. `const lease = await this.leases.getForUser(userId, leaseId)` — тот же
     паттерн, что в `MetersService.findAllForLease` (`meters.service.ts:92`).
     Не сторона договора или договора нет → 404 `'Договор не найден'` (бросает
     сам `getForUser`).
  2. `const meter = await this.prisma.meter.findUnique({ where: { id: meterId } })`;
     если счётчика нет **или** `meter.propertyId !== lease.propertyId` → 404
     `'Счётчик не найден'`. Это и есть закрытие утечки между договорами.
  3. `return this.prisma.meterReading.findMany({ where: { meterId, leaseId }, orderBy: { readingDate: 'desc' } })`
     — выборка по паре из URL, без поиска «активного» договора.
- **Статус договора не проверяется** и `meter.isActive` **не проверяется** —
  доступ есть при `active`/`terminated`/`draft` и у отключённого счётчика
  (ADR-0034: доступ определяется принадлежностью к договору, не статусом;
  история отключённого счётчика должна оставаться читаемой).
- Внедрить `LeasesService` в конструктор `MeterReadingsService`. `LeasesModule`
  уже импортирован в `MetersModule` (`meters.module.ts:3`); циклической
  зависимости нет (`LeasesModule` зависит только от properties/notifications,
  `leases.module.ts:18`) — **`forwardRef` не использовать**.
- Обновить комментарий над методом: ссылка на ADR-0034 вместо «текущего
  активного договора».

### B2. Та же утечка через `lastReadingValue` (обязательно в этом же заходе)

`MetersService.findAllForLease` (`backend/src/meters/meters.service.ts:109-137`)
отдаёт `lastReadingValue` из последнего показания счётчика **без фильтра по
договору**, а хаб `GET /leases/:leaseId/meters` доступен стороне договора
независимо от статуса (`getForUser` статус не проверяет). Бывший арендатор,
открыв свой завершённый договор, видит свежее показание нынешнего арендатора.
Это тот же дефект, что чинит B, просто через соседний эндпоинт — закрывать
вместе с ним, иначе фикс частичный.

Контракт поля после фикса (важно не сломать подачу показаний):

- если `lease.status === active` — поведение прежнее: последнее показание
  счётчика без фильтра по договору. Это необходимо: при подаче нового
  показания сервер сравнивает с последним значением счётчика в целом
  (`meter-readings.service.ts:87-99`), и хаб обязан показывать ту же базу,
  иначе арендатор упрётся в «показание не может быть меньше предыдущего».
- если `lease.status !== active` (то есть `draft`, **`sent`** и `terminated` —
  все три статуса `LeaseStatus`, `schema.prisma:104-109`; после принятия
  приглашения tenant уже привязан к `sent`-договору,
  `leases.service.ts:306`) — брать последнее
  показание **этого** договора (`readings: { where: { leaseId: lease.id } }`),
  а при их отсутствии — `meter.initialReading`. Новые показания по такому
  договору всё равно не подаются, база сравнения не нужна.

`findAllForOwner` (`meters.service.ts:59-70`, landlord-only карточка объекта)
**не трогать** — собственнику видны все показания своих счётчиков по праву.

### Backend — маршрут

- Удалить `@Get()` из `backend/src/meters/meter-readings.controller.ts:53`
  (`GET /meters/:meterId/readings`). Старый маршрут не оставлять даже как
  deprecated — именно он и есть утечка.
- Добавить `GET /leases/:leaseId/meters/:meterId/readings` в
  `backend/src/meters/lease-meters.controller.ts` (контроллер уже смонтирован
  на `leases/:leaseId/meters`), вызывающий
  `MeterReadingsService.listForLeaseMeter(user.id, leaseId, meterId)`.
  Добавить `MeterReadingsService` вторым аргументом конструктора.
- `POST /meters/:meterId/readings` (подача нового показания) **не трогать**:
  ADR-0034 оставляет подачу привязанной к активному договору объекта.

### Frontend

- `frontend/lib/catalog.ts:152-154`: `listReadingHistory(meterId)` →
  `listReadingHistory(leaseId: string, meterId: string)`, путь
  `/leases/${leaseId}/meters/${meterId}/readings`.
- `frontend/app/leases/[id]/meters/[meterId]/history/page.tsx`: передавать `id`
  (уже разбирается из `useParams`, строка 18) первым аргументом; добавить `id`
  в зависимости `useCallback` (сейчас `[meterId]`).
- Проверить, что других вызовов нет: `grep -rn "listReadingHistory" frontend/`
  и что не осталось GET-обращений к `/meters/${meterId}/readings`.
- Навигацию на карточке расторгнутого договора **не менять**: `LeaseTabs`
  скрыт для не-`active` (`frontend/app/leases/[id]/page.tsx:363`) — это
  осознанно вне скоупа (архивная навигация — остаток Фазы 34). Экран истории
  проверяется прямым переходом по URL.

### Тесты (backend, `meter-readings.service.spec.ts`)

Конструктор сервиса в спеке создаётся вручную (`spec:38`) — добавить пятым
аргументом мок `LeasesService` с `getForUser`. Заменить/дополнить кейсы
(строки 152-172):

- landlord завершённого (`terminated`) договора получает историю **этого**
  договора — раньше был 404;
- бывший арендатор своего завершённого договора получает историю;
- `leaseId` договора C + `meterId` объекта, где активен договор A → 404
  (`meter.propertyId !== lease.propertyId`), а не показания A — регресс-тест
  на воспроизведённую утечку;
- не сторона договора → 404 (пробрасывается из `getForUser`);
- несуществующий `meterId` → 404;
- отключённый счётчик (`isActive: false`) → история отдаётся;
- выборка идёт по паре `{ meterId, leaseId }` — проверить аргументы
  `prisma.meterReading.findMany`;
- у счётчика два последовательных договора: арендатор второго не видит строк
  первого.

Дополнительно в `backend/src/meters/meters.service.spec.ts` — регресс-тесты на
`findAllForLease` (B2):

- завершённый (`terminated`) договор + показание следующего арендатора в базе
  → `lastReadingValue` равно последнему показанию **своего** договора;
- `sent`-договор на объекте, где есть показания другого договора →
  `lastReadingValue` не показывает чужое значение (отдельный кейс: реализация
  «только для terminated» обязана его провалить);
- договор без своих показаний → `lastReadingValue` равно
  `meter.initialReading`, а не чужому значению;
- активный договор → значение прежнее (последнее показание счётчика в целом),
  существующие кейсы остаются зелёными.

### Тест маршрутов (обязателен — компиляции недостаточно)

Добавить лёгкий тест метаданных маршрутов (например,
`backend/src/meters/meters.routes.spec.ts`), который через
`Reflect.getMetadata(PATH_METADATA, …)` / `Reflect.getMetadata(METHOD_METADATA, …)`
(`@nestjs/common/constants`) утверждает:

- у `MeterReadingsController` больше нет ни одного GET-хэндлера;
- у `MeterReadingsController` **сохранился** POST-хэндлер на корневом пути
  (`RequestMethod.POST`) — иначе исполнитель может снести весь хэндлер целиком,
  и тест останется зелёным;
- `LeaseMetersController` смонтирован на `leases/:leaseId/meters` и имеет
  GET-хэндлер с путём `:meterId/readings`.

Этот вариант проверен на текущих Nest 10 + ts-jest и работает. Запасной
вариант (`moduleRef.createNestApplication()` + `await app.init()` +
`app.getHttpAdapter()`) использовать только если первый не заработает;
`supertest` в `backend/package.json` отсутствует — HTTP-тесты не заводить.

---

## C. Ретеншен ПДн удаляет и `LeaseDocument` (Фаза 25 / A-24, ADR-0033)

### Проблема

`backend/src/party-info/party-info.service.ts:274-310`, `runRetention()`
удаляет только `LeasePartyInfo`. Расшифрованные паспортные данные остаются в
`LeaseDocument.content` (обычная строка) бессрочно — обещание политики
(`backend/src/legal/privacy-policy.const.ts`) фактически не выполняется.

### C1. Общий модуль срока ретеншена

Создать `backend/src/legal/retention.const.ts` (рядом с уже существующим
`privacy-policy.const.ts`, чтобы им могли пользоваться и `PartyInfoService`, и
`LeaseDocumentsService` без DI и без риска цикла модулей):

```ts
export const RETENTION_YEARS = 3; // ГК РФ ст. 196 (ADR-0021)
// Момент, начиная с которого ПДн договора подлежат удалению.
export function retentionExpiryOf(endedAt: Date): Date;
export function isRetentionExpired(
  lease: { status: LeaseStatus; endDate: Date; effectiveEndDate: Date | null },
  now?: Date,
): boolean;
```

Контракт расчёта (обязателен именно такой, иначе граничные случаи считаются
неверно):

- `endedAt = effectiveEndDate ?? endDate`;
- `retentionExpiryOf` считает **годовщину вперёд от `endedAt` в UTC**
  (`Date.UTC(getUTCFullYear() + RETENTION_YEARS, getUTCMonth(), getUTCDate(), …)`),
  а не отматывает три года назад от `now` через
  `setFullYear(getFullYear() - 3)`. Обратный расчёт зависит от таймзоны
  процесса и ошибается на високосном годе: для `now = 2028-02-29` он даёт
  cutoff `2025-03-01`, из-за чего договор, завершённый `2025-02-28`, будет
  считаться недозревшим, хотя три года уже прошли;
- `isRetentionExpired` → `lease.status === terminated && now >= retentionExpiryOf(endedAt)`.
  Ровно в момент годовщины срок считается наступившим (политика обещает
  удаление по наступлении трёхлетнего срока).
- `runRetention` использует ту же функцию, а не собственный `cutoff` — второй
  реализации расчёта в проекте быть не должно.

`party-info.service.ts:26` — убрать локальную константу `RETENTION_YEARS`,
импортировать из нового файла.

### C2. Гард: после ретеншена документы нельзя пересоздать

**Найдено адверсарным ревью плана и подтверждено по коду** — без этого пункта
C не даёт ничего: `LeaseDocumentsService.generate()` не проверяет ни статус
договора, ни срок (`backend/src/leases/lease-documents.service.ts:61`), то же
у `generateHandoverAct()` (`:158`); `generateReturnAct()` требует только
`terminated` (`:208`). Собственник после очистки может нажать
«Перегенерировать» и вернуть в базу ФИО сторон
(`lease-documents.service.ts:87`), то есть отменить ретеншен одним кликом.

- Во всех трёх методах генерации, сразу после проверки принадлежности договора
  (`!lease || lease.landlordId !== userId`), добавить:
  `if (isRetentionExpired(lease)) throw new ConflictException('Срок хранения данных договора истёк — документы удалены и не создаются заново');`
- Читающие методы (`getLatest*`) **не трогать**: после удаления они и так
  отдают свои штатные 404 «ещё не сгенерирован».
- Фронт **не трогать**: кнопки остаются, пользователь получит понятное
  сообщение об ошибке существующим механизмом отображения ошибок. Скрытие
  кнопок — не в этом заходе.

### C3. Само удаление

`backend/src/party-info/party-info.service.ts`:

- Добавить **публичный** метод (его же вызовет ручной запрос из `/profile`,
  Фаза 29 — ADR-0033 требует единственную точку удаления; приватный метод
  для этого не годится):

  ```ts
  async purgeLeasePii(leaseId: string): Promise<{ partyInfo: number; documents: number }>
  ```

  Реализация — callback-вариант транзакции, как принято в проекте
  (`meter-readings.service.ts:116`, `leases.service.ts:212`):
  `this.prisma.$transaction(async (tx) => { … })`, внутри —
  `tx.leasePartyInfo.deleteMany({ where: { leaseId } })` и
  `tx.leaseDocument.deleteMany({ where: { leaseId } })` (**все** `kind` и все
  `version`, без фильтров). Комментарий над методом: единственная точка
  удаления ПДн договора, ADR-0033, переиспользуется Фазой 29.
- `runRetention(now)` вызывает `purgeLeasePii` для каждого дозревшего договора.
- Расширить выборку кандидатов: сейчас `where` требует `partyInfo: { some: {} }`,
  из-за чего договор, у которого `LeasePartyInfo` уже удалён прошлым запуском,
  а `LeaseDocument` остался, **никогда не будет вычищен**. Заменить на
  `OR: [{ partyInfo: { some: {} } }, { documents: { some: {} } }]` при том же
  `status: LeaseStatus.terminated`. Это обязательная часть фикса.
- **Отсрочка при активном споре — привести в соответствие с ADR-0021.**
  ADR-0021 (`docs/adr/0021-lease-party-personal-data.md:98-99`) требует паузу
  при `TerminationRequest` **или** открытой `MaintenanceRequest`, но код
  проверяет только вторую — ПДн удаляются при незакрытом споре о расторжении.
  Добавить в выборку кандидатов
  `terminationRequests: { where: { status: TerminationStatus.pending }, select: { id: true } }`
  и пропускать договор, если таких заявок больше нуля. В том же `select`
  добавить `status: true` — он нужен `isRetentionExpired` и сейчас не
  выбирается (`party-info.service.ts:283-295`); фикстуры существующих тестов
  `runRetention` тоже дополнить полем `status: LeaseStatus.terminated`. Модель допускает
  несколько заявок, и финализация одной не закрывает остальные
  (`backend/src/termination/termination.service.ts:42-49,98-105`) — проверять
  именно «нет ни одной pending».
- Прочие условия не меняются: `endedAt = effectiveEndDate ?? endDate`, срок
  `RETENTION_YEARS`, пропуск при `maintenanceRequests` в `open`/`in_progress`.
- Возвращаемое значение `runRetention`: `{ deleted: number; documentsDeleted: number }`,
  где `deleted` сохраняет прежний смысл (удалённые `LeasePartyInfo`).
- `backend/src/party-info/party-info.scheduler.ts`: логировать оба числа
  (`Ретеншен ПДн: удалено записей ПДн — N, версий документов — M`), условие —
  `if (deleted || documentsDeleted)`.

### Вне скоупа (зафиксировать, не делать)

`LeaseSignedScan` — загруженные сканы подписанного договора — ретеншеном не
затрагивается, ADR-0033 его не упоминает. Это потенциально та же проблема
(скан содержит ПДн и файл в `backend/uploads/`), но решение не принято.
**Не расширять скоуп** — упомянуть находку в отчёте.

### Тесты

`backend/src/party-info/party-info.service.spec.ts`:

- Дополнить `PrismaMock` (`spec:15`): добавить `leaseDocument: { deleteMany }`
  и `$transaction`. Мок `$transaction` должен вызывать callback с **отдельным
  `tx`-объектом со своими jest-моками**, а не с самим `prisma` — иначе
  проверка «удаления внутри транзакции» даст ложноположительный результат
  (типовой мок проекта передаёт тот же объект, `meter-readings.service.spec.ts:30`).
- Кейсы блока `runRetention`:
  - дозревший договор → внутри транзакции вызваны оба `tx.*.deleteMany` c
    `{ where: { leaseId: 'l1' } }`; возвращены оба счётчика;
  - договор младше 3 лет → `$transaction` не вызывался вовсе;
  - незакрытая заявка → `$transaction` не вызывался вовсе;
  - `effectiveEndDate` приоритетнее `endDate` (существующий кейс, сохранить);
  - **новый:** договор без `LeasePartyInfo`, но с `LeaseDocument` попадает в
    кандидаты — проверить наличие `OR` в аргументах `prisma.lease.findMany`.

`backend/src/leases/lease-documents.service.spec.ts` (файл уже существует — дополнить его, не создавать новый):

- `generate` / `generateHandoverAct` / `generateReturnAct` по договору
  `terminated` с окончанием более 3 лет назад → `ConflictException`, запись не
  создана;
- те же методы по договору `terminated`, завершённому недавно → работают
  как раньше;
- `generate` по `active`-договору → работает как раньше.

---

## Порядок работы

A, B и C независимы. Делать в порядке A → B → C, коммит **один** на весь
«пункт 0» — это один связный security-фикс. Сообщение коммита в стиле
существующих: `Пункт 0: закрыть authz-баги счетов и показаний, довести ретеншен ПДн`.
Коммит создавать только после того, как пройдено ревью — не раньше.

## Проверка (обязательна перед сдачей)

```bash
cd backend && npm test          # текущая база — 317/317 (27 сюит), после правок не меньше
cd backend && npx tsc --noEmit
cd backend && npm run build
cd frontend && npx tsc --noEmit
cd frontend && npm run build    # не поверх работающего dev-сервера, см. DEV_STATE
```

Живую HTTP-проверку проводит ревьюер; исполнителю она не требуется, но и не
запрещена.

## Документация (по `CLAUDE.md`, обязательна)

- `docs/CHANGELOG.md` — запись о фиксах со ссылками на Фазы 34/33/25 и
  ADR-0034/ADR-0033.
- `docs/DEV_STATE.md` — в «Рекомендуемый следующий шаг» отметить пункт 0
  закрытым (следующим шагом остаётся Фаза 13); в «Контекст последней сессии»
  описать изменения контракта API: `GET /meters/:meterId/readings` удалён,
  появился `GET /leases/:leaseId/meters/:meterId/readings`; генерация
  документов запрещена после истечения ретеншена.
- `backend/README.md:160` — раздел про показания разделить: `POST` остаётся на
  `/api/meters/:meterId/readings`, `GET` переехал на
  `/api/leases/:leaseId/meters/:meterId/readings`.
- Новые ADR **не заводить** — решения приняты (ADR-0033, ADR-0034, Фаза 34 явно
  без ADR). Гард C2 — прямое следствие ADR-0033, отдельного решения не требует,
  но должен быть явно упомянут в CHANGELOG и DEV_STATE.
- `docs/ROADMAP.md` трогать, только если там есть статусы этих фаз.

## Критерии приёмки

1. `POST /bills/:billId/finalize` арендатором договора → 404, счёт остаётся в
   `draft`, следующий черновик не создан. Собственником → 200, как раньше.
2. Кнопка «Сформировать счёт» на `/leases/[id]/bills` видна только собственнику.
3. `GET /meters/:meterId/readings` больше не смонтирован (подтверждено тестом
   маршрутов, не только компиляцией). `POST` на том же пути работает.
3a. `GET /leases/:leaseId/meters` по любому не-`active` договору — `draft`,
   `sent` и `terminated` — не показывает `lastReadingValue` чужого договора:
   значение берётся из своего договора либо равно `initialReading`. Кейс
   `sent` проверяется отдельно от `terminated`. Для активного договора
   значение прежнее.
4. `GET /leases/:leaseId/meters/:meterId/readings`:
   - собственник и бывший арендатор завершённого договора получают историю
     ровно этого договора;
   - `meterId` чужого объекта под своим `leaseId` → 404;
   - не сторона договора → 404; несуществующий счётчик → 404;
   - отключённый счётчик отдаёт историю;
   - у счётчика с двумя последовательными договорами каждая сторона видит
     только свой период.
5. Экран истории показаний открывается прямым URL и для расторгнутого
   договора, и для активного, обеими ролями. Вкладки на карточке договора не
   менялись.
6. `runRetention` удаляет `LeasePartyInfo` **и** все версии `LeaseDocument`
   дозревшего договора в одной транзакции (доказано через отдельный `tx`-мок);
   договор с одними лишь документами тоже попадает в выборку; удаление
   откладывается и при открытой `MaintenanceRequest`, и при pending
   `TerminationRequest`.
6a. Срок считается годовщиной вперёд в UTC: тесты покрывают ровно границу,
   границу минус 1 мс, високосный случай (`2025-02-28` + 3 года при
   `now = 2028-02-29`), приоритет `effectiveEndDate`, и `active`-договор
   (никогда не истекает).
7. После истечения ретеншена все три метода генерации документов отвечают 409
   и не создают записей; для недозревших и активных договоров поведение
   прежнее.
8. Все команды из раздела «Проверка» проходят; новые тесты покрывают пункты
   1, 3, 3a, 4, 6, 6a, 7.
9. `docs/CHANGELOG.md`, `docs/DEV_STATE.md`, `backend/README.md` обновлены.

## Явно вне скоупа

- Фаза 13 и любые `notify()`-триггеры, ссылка-приглашение.
- Остальная часть Фазы 33 (двухшаговое подтверждение аномалии >10×,
  приоритизация активных счётчиков, тексты пустых состояний).
- Остальная часть Фазы 34 (архивная навигация для `terminated`, разделение
  «Требуют действия»/«История», подписи, разведение loading/error).
- Фаза 29 (`/profile`, ручной запрос на удаление) — только оставить
  `purgeLeasePii` публичным и пригодным для переиспользования.
- `LeaseSignedScan` в ретеншене.
- Скрытие кнопок генерации документов на фронте после ретеншена.
- Любые миграции схемы БД, OCR (ADR-0008), production-контур (ADR-0031).
