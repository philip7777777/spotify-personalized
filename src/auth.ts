import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTotpToken, compareRecoveryCode } from "@/lib/totp";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        code: { label: "2FA Code", type: "text" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        const code = credentials?.code as string | undefined;

        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

        if (user.totpEnabled) {
          if (!code) return null;

          let valid = false;

          if (user.totpSecret && verifyTotpToken(code, user.totpSecret)) {
            valid = true;
          } else {
            // Fall back to checking unused recovery codes.
            const unusedCodes = await prisma.recoveryCode.findMany({
              where: { userId: user.id, usedAt: null },
            });
            for (const recoveryCode of unusedCodes) {
              if (await compareRecoveryCode(code, recoveryCode.codeHash)) {
                await prisma.recoveryCode.update({
                  where: { id: recoveryCode.id },
                  data: { usedAt: new Date() },
                });
                valid = true;
                break;
              }
            }
          }

          if (!valid) return null;
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as { username?: string }).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
      }
      return session;
    },
  },
});
