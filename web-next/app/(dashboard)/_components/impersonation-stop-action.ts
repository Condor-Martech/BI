"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stopImpersonation } from "@/lib/auth/impersonation";

export async function stopImpersonationAction() {
  const result = await stopImpersonation();
  if (result.expired) {
    redirect("/login");
  }
  revalidatePath("/");
}
