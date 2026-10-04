import { adminEmail, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shared";
import { Admin } from "@/components/admin";
export default async function AdminPage() {
  const email = await adminEmail();
  if (!email) redirect("/admin/login");
  return (
    <>
      <Brand admin />
      <div className="admin-user">
        <span>{email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button className="text-button">Sign out</button>
        </form>
      </div>
      <Admin />
    </>
  );
}
