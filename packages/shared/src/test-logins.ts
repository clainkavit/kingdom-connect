/** A fake account shown on a preview site's login screen. */
export type TestLogin = { label: string; login: string; password: string };

/** Only accounts that are fake by name: `test_*` usernames or `@example.test` emails. */
export const isTestAccount = (login: string) =>
  /^test_[a-z0-9_.]+$/i.test(login) || /^[^@\s]+@example\.test$/i.test(login);

/**
 * Reads the test logins a preview site was built with (`EXPO_PUBLIC_TEST_LOGINS` or
 * `NEXT_PUBLIC_TEST_LOGINS`, a JSON list). Never set on a real environment. Anything that is not a
 * fake account by name is dropped, so a real person's login can never be shown.
 */
export function parseTestLogins(raw: string | undefined | null): TestLogin[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const { label, login, password } = item as Record<string, unknown>;
      if (typeof label !== "string" || typeof login !== "string" || typeof password !== "string")
        return [];
      return isTestAccount(login) && password ? [{ label, login, password }] : [];
    });
  } catch {
    return [];
  }
}
