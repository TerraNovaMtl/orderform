import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
export function allowedAdmin(email?: string | null) {
  return (
    !!email &&
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  );
}
export const authConfigured = () =>
  !!(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.ADMIN_EMAILS
  );
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/admin/login", error: "/admin/login" },
  callbacks: {
    signIn({ account, profile, user }) {
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        allowedAdmin(user.email)
      );
    },
  },
});
export async function adminEmail() {
  if (!authConfigured()) return null;
  const session = await auth();
  return allowedAdmin(session?.user?.email) ? session!.user!.email! : null;
}
