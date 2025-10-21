-- CreateTable
CREATE TABLE `QuickReply` (
  `pkId` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL,
  `text` TEXT NULL,
  `tags` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`pkId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `QuickReply_title_idx` ON `QuickReply`(`title`);

