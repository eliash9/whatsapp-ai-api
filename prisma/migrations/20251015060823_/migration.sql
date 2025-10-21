-- CreateTable
CREATE TABLE `AiSetting` (
    `pkId` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` VARCHAR(128) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `prompt` TEXT NULL,
    `model` VARCHAR(64) NULL,
    `temp` DOUBLE NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiSetting_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `unique_ai_setting_per_session`(`sessionId`),
    PRIMARY KEY (`pkId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
