import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { isStaff } from "@/lib/permissions";

export default async function Home() {
  const user = await requireUser();
  redirect(isStaff(user.role) ? "/admin" : "/portal");
}
