export function getSuperAdminEmails(): Set<string> {
  const plural = process.env.SUPER_ADMIN_EMAILS ?? '';
  const singular = process.env.SUPER_ADMIN_EMAIL ?? '';
  const raw = plural.trim() !== '' ? plural : singular;
  return new Set(
    raw
      .split(',')
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e.length > 0),
  );
}

export function isSuperAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getSuperAdminEmails().has(String(email).toLowerCase().trim());
}
