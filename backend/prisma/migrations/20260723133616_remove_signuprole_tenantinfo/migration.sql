-- Убрана роль при регистрации и паспортные данные (TenantInfo), см. CHANGELOG 2026-07-23.
DROP TABLE "tenant_info";
ALTER TABLE "users" DROP COLUMN "signupRole";
DROP TYPE "SignupRole";
