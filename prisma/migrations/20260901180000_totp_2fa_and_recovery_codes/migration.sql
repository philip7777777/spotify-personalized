-- AlterTable: drop SMS-based 2FA fields, add TOTP fields
ALTER TABLE "User" DROP COLUMN "phone";
ALTER TABLE "User" DROP COLUMN "phoneVerified";
ALTER TABLE "User" DROP COLUMN "twoFactorCode";
ALTER TABLE "User" DROP COLUMN "twoFactorCodeExpires";
ALTER TABLE "User" RENAME COLUMN "twoFactorEnabled" TO "totpEnabled";
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
