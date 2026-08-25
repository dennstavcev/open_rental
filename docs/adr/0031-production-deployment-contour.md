# 0031. Production-контур — Docker Compose, immutable-образы и SSH-деплой

Дата: 2026-08-24
Статус: Принято

## Контекст

SoftRent должен быть развернут на Ubuntu-сервере в России. На сервере не будет
ИИ-инструментов, а обновления должны выполняться автоматически или одной
предсказуемой командой из версионируемого Git-релиза. Сервис хранит
персональные данные, документы и чеки, поэтому обычного `git pull` и запуска
Node-процессов недостаточно: требуются воспроизводимые релизы, backup,
контролируемые миграции, rollback и изоляция сервисов.

## Рассмотренные варианты

1. `git pull` и сборка непосредственно на production-сервере — просто, но
   смешивает build/production, расходует ресурсы сервера и ухудшает
   воспроизводимость и rollback.
2. Постоянный GitHub self-hosted runner на production — автоматизирует
   обновления, но дает workflow возможность выполнять код рядом с production
   секретами, БД и файлами.
3. GitHub-hosted CI собирает immutable Docker-образы, после ручного approval
   ограниченный SSH-деплой устанавливает конкретный Git SHA — требует
   первоначальной настройки, зато отделяет сборку от production и дает
   однозначный релиз/rollback.
4. Kubernetes — дает оркестрацию и масштабирование, но для одного MVP-сервера
   несоразмерно сложен.

## Решение

Выбран вариант 3:

- один Ubuntu VPS на российской площадке;
- Docker Engine + Docker Compose;
- frontend, backend, PostgreSQL и при необходимости Redis в изолированных
  контейнерах/сетях;
- наружу доступны только reverse proxy `80/443` и ограниченный SSH;
- GitHub-hosted CI проверяет и собирает образы с тегом полного commit SHA;
- production deployment выполняется отдельным SSH-пользователем после ручного
  approval;
- сервер запускает идемпотентный `deploy.sh`, backup, `prisma migrate deploy`,
  healthcheck и smoke-test;
- rollback возвращает предыдущие образы; схема БД меняется совместимыми
  expand/contract миграциями;
- при нестабильном доступе сервера к registry образы передаются по SSH и
  проверяются по digest;
- production self-hosted runner и Kubernetes не используются;
- подробные требования и security gate определены в
  `docs/PRODUCTION_DEPLOYMENT_AND_SECURITY.md`.

Postfix остается отдельным решением ADR-0030 и для первого VPS рекомендуется
как host service с OpenDKIM, закрытым relay и обязательными PTR/SPF/DKIM/DMARC.

## Последствия

- Требуются production Dockerfile для frontend/backend, отдельный Compose,
  reverse proxy, health endpoint и deploy/rollback/backup/restore scripts.
- Git SHA и digest образа становятся идентификатором production-релиза;
  `latest` не используется как источник правды.
- Production secrets не хранятся в Git и Docker image.
- PostgreSQL, Redis и application ports не публикуются в интернет.
- До реальных пользователей обязательны security gate, проверенное
  восстановление backup и устранение хранения refresh JWT в `localStorage`.
- Один VPS остается single point of failure; риск принимается для MVP и
  компенсируется независимым зашифрованным backup на RU-площадке.

