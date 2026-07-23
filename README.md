# Apartment Rental — Landlord-Tenant Communication Service

Рабочее название продукта — **OPENRENT** (предварительное, 2026-07-21).

Веб-сервис для коммуникации между арендодателем и арендатором помещения:
единое пространство для переписки, документов, заявок на обслуживание и
истории отношений по конкретному объекту/договору аренды.

Дизайн-референсы (не финальный утверждённый дизайн, разбирает `designer`,
см. `docs/DESIGN_SYSTEM.md`):
- Claude Design (приоритетный, 2026-07-22): https://claude.ai/design/p/9d23e4c8-1e7a-44a7-862a-3d3e5fb89e0e
  — импортируется через MCP `claude_design`, авторизация `/design-login`.
- Figma (более ранний, 2026-07-21): https://www.figma.com/design/sYKpsyXDvmj0cDWTKC5bTF/OpenPay

Phase 1 (MVP) в активной разработке. Код:
- [`backend/`](backend/README.md) — NestJS (модульный монолит): Auth,
  объекты/счётчики/услуги, договоры (генерация текста, сканы, активация,
  расторжение), биллинг (счета/пени/показания/планировщик), заявки, чат,
  отчёты, уведомления, ПДн с шифрованием + SuperAdmin.
- [`frontend/`](frontend/README.md) — Next.js: Auth + объекты (старт).

Ключевые решения фиксируются в `docs/adr/`, статусы — в `docs/ROADMAP.md`,
журнал — в `docs/CHANGELOG.md`.

## Документация

| Файл | Назначение |
|---|---|
| [`docs/IDEA.md`](docs/IDEA.md) | Проблема, целевые пользователи, ценность продукта |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Архитектура, стек, модель данных (черновик) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Этапы разработки и их статус |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Журнал решений и изменений по проекту |
| [`docs/adr/`](docs/adr/README.md) | Architecture Decision Records — обоснования архитектурных решений |
| [`docs/DOCUMENTATION_RULES.md`](docs/DOCUMENTATION_RULES.md) | Правила фиксации реперных точек проекта в md-файлах |
| [`docs/PRODUCT_QUESTIONS.md`](docs/PRODUCT_QUESTIONS.md) | Опросник по продукту — закрыть перед стартом реализации MVP |
| [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md) | Модули и экраны MVP — продуктовая спецификация |
| [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md) | User flows и user stories по модулям MVP |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Дизайн-система и спеки экранов (ведёт `designer`) |
| [`docs/TEAM_STRUCTURE.md`](docs/TEAM_STRUCTURE.md) | Структура агентной команды (CEO + подчинённые роли) |
| [`docs/READINESS_AUDIT.md`](docs/READINESS_AUDIT.md) | Честный аудит готовности к старту Phase 1 — что закрыто, что блокирует код |
| [`.claude/agents/`](.claude/agents/) | Определения агентов для CLI (Claude Code / Fable 5) |

## Статус

Стадия: **Phase 0 завершена по продуктовым решениям** (см.
`docs/ROADMAP.md`) — открытые продуктовые вопросы закрыты, включая
юридическую значимость подписи; user flows/stories готовы
(`docs/USER_FLOWS.md`). Перед стартом Phase 1 остаётся закрыть
конкретные технические развилки (бэкенд-фреймворк, механизм
аутентификации, хостинг с учётом 152-ФЗ, файловое хранилище, OCR-движок)
— см. `docs/READINESS_AUDIT.md`.
