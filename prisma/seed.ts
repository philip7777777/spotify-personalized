/**
 * Seeds (or resets) the single application user.
 *
 * Usage:
 *   npx tsx prisma/seed.ts
 *
 * Prints the generated password once — save it somewhere safe (e.g. a
 * password manager). Re-running this script will reset the password to a
 * newly generated one.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const USERNAME = "philip.chakram";

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { username: USERNAME },
    update: { passwordHash },
    create: { username: USERNAME, passwordHash },
  });

  console.log("User ready:");
  console.log(`  username: ${user.username}`);
  console.log(`  password: ${password}`);
  console.log(
    "\nSave this password now — it will not be shown again. Log in at /login, then change it from /settings if you'd like."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
