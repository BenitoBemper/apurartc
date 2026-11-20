"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE_COMPETENCIA, COOKIE_EMPRESA } from "@/lib/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";

const UM_ANO = 60 * 60 * 24 * 365;

export async function definirEmpresa(id: string) {
  (await cookies()).set(COOKIE_EMPRESA, id, { path: "/", maxAge: UM_ANO, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function definirCompetencia(competencia: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return;
  (await cookies()).set(COOKIE_COMPETENCIA, competencia, { path: "/", maxAge: UM_ANO, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
