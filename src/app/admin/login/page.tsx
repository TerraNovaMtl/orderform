import { signIn, authConfigured, adminEmail } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shared";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await adminEmail()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <>
      <Brand admin />
      <main className="access-card">
        <span className="eyebrow">Team access</span>
        <h1>
          Manage your
          <br />
          wholesale business.
        </h1>
        <p>Sign in with your approved Google account.</p>
        {error && (
          <p className="error" role="alert">
            Sign-in was not completed. Use an approved administrator account or
            contact the project owner.
          </p>
        )}
        {authConfigured() ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/admin" });
            }}
          >
            <button>Continue with Google</button>
          </form>
        ) : (
          <p className="notice">
            Administrator sign-in is not configured yet. Please contact the
            project owner.
          </p>
        )}
        <a className="back-link" href="/">
          Back to Terra Nova
        </a>
      </main>
    </>
  );
}
