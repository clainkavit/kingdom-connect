import postgres from "npm:postgres@3.4.9";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import type { AccountStatus, Language } from "./login-rules.ts";

export const sql = postgres(Deno.env.get("DB_URL") ?? Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 3,
});

export const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export function anonClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function platformName(): Promise<string> {
  const [row] = await sql`
    select value #>> '{}' as name from public.platform_settings where key = 'platform_name'`;
  return row?.name ?? "Kingdom Connect";
}

export type Account = { id: string; email: string; status: AccountStatus; language: Language };

const accountColumns = sql`
  u.id, u.email,
  private.account_status(u.id) as status,
  coalesce(p.language, 'en') as language`;

const accountJoins = sql`
  from auth.users u
  left join public.members m on m.id = u.id
  left join public.staff s on s.id = u.id
  left join public.member_private p on p.member_id = u.id`;

export async function accountById(id: string): Promise<Account | null> {
  const [row] = await sql`select ${accountColumns} ${accountJoins} where u.id = ${id}`;
  return (row as Account | undefined) ?? null;
}

export async function accountByUsername(username: string): Promise<Account | null> {
  const [row] = await sql`
    select ${accountColumns} ${accountJoins} where m.username = ${username}::extensions.citext`;
  return (row as Account | undefined) ?? null;
}

/** A member by username, email or phone. A phone number shared by more than one member matches no one. */
export async function memberAccountByLogin(name: {
  kind: "username" | "email" | "phone";
  value: string;
}): Promise<Account | null> {
  if (name.kind === "username") return accountByUsername(name.value);
  const rows =
    name.kind === "email"
      ? await sql`
          select ${accountColumns} ${accountJoins}
          where m.id is not null and lower(p.email) = ${name.value} limit 2`
      : await sql`
          select ${accountColumns} ${accountJoins}
          where m.id is not null and p.phone = ${name.value} limit 2`;
  return rows.length === 1 ? (rows[0] as Account) : null;
}

export async function staffAccountByEmail(email: string): Promise<Account | null> {
  const [row] = await sql`
    select ${accountColumns} ${accountJoins} where s.id is not null and lower(u.email) = ${email}`;
  return (row as Account | undefined) ?? null;
}
