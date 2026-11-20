// Cliente com a chave secreta (service_role): IGNORA o RLS.
// Usar só em código de servidor, e sempre filtrando pelo escritório já autorizado (admin logado ou chave de API).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@apurartc/db";

let cliente: ReturnType<typeof createClient<Database>> | null = null;

export function clienteAdmin() {
  if (!cliente) {
    const chave = process.env.SUPABASE_SECRET_KEY;
    if (!chave) throw new Error("SUPABASE_SECRET_KEY não definida (veja apps/web/.env.example)");
    cliente = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
