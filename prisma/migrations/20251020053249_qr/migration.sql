/*
  Warnings:

  - Made the column `text` on table `quickreply` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `quickreply` MODIFY `text` TEXT NOT NULL;
