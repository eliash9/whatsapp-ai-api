-- AlterTable
ALTER TABLE `AiSetting` ADD COLUMN `authHeaderName` VARCHAR(64) NULL,
    ADD COLUMN `authScheme` VARCHAR(32) NULL,
    ADD COLUMN `extraHeaders` TEXT NULL,
    ADD COLUMN `providerApiKey` TEXT NULL,
    ADD COLUMN `providerBaseUrl` VARCHAR(255) NULL;
