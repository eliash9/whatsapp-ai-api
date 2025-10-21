-- CreateTable
CREATE TABLE `Ticket` (
    `pkId` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` VARCHAR(128) NOT NULL,
    `customerJid` VARCHAR(128) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'open',
    `subject` VARCHAR(255) NULL,
    `priority` VARCHAR(32) NULL,
    `assignedTo` VARCHAR(128) NULL,
    `slaDueAt` DATETIME(3) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Ticket_sessionId_idx`(`sessionId`),
    INDEX `Ticket_status_idx`(`status`),
    INDEX `Ticket_customerJid_idx`(`customerJid`),
    PRIMARY KEY (`pkId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMessage` (
    `pkId` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketId` INTEGER NOT NULL,
    `direction` VARCHAR(8) NOT NULL,
    `text` TEXT NULL,
    `messagePkId` INTEGER NULL,
    `ts` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketMessage_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`pkId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`pkId`) ON DELETE CASCADE ON UPDATE CASCADE;
