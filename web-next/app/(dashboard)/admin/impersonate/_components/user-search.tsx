"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Backend endpoint: GET /users/all (MANAGER-only)
//   Query params (ListUsersDto): `search` (name/email/ISLV, case-insensitive), `role`, `lastLoginFrom`, `lastLoginTo`
//   Response: raw array of user documents. IDs use Mongo `_id` (legacy inconsistency between _id/id).
// We pass `search` server-side when the user has typed something; we also keep a client-side
// filter as a safety net for the legacy's inconsistent shapes.
async function fetchUsers(query: string): Promise<UserRow[]> {
  const q = query.trim();
  const url = q
    ? `/api/users/all?search=${encodeURIComponent(q)}`
    : `/api/users/all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const body = await res.json();
  const items: Array<Record<string, unknown>> = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: Array<Record<string, unknown>> }).items
      : [];

  const normalized: UserRow[] = items.map((u) => ({
    id: String((u._id ?? u.id) as string),
    email: String(u.email ?? ""),
    name: String(u.name ?? ""),
    role: String(u.role ?? ""),
  }));

  const needle = q.toLowerCase();
  if (!needle) return normalized.slice(0, 20);
  return normalized.filter(
    (u) => u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle),
  );
}

export function UserSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const items = await fetchUsers(query);
        if (!controller.signal.aborted) setResults(items);
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function impersonate(email: string) {
    setError(null);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { message?: string }).message ?? `Erro ${res.status}`);
      return;
    }
    // BFF sets the new bi_token cookie server-side; response is { target } (no token).
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nome ou email..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <p className="text-sm text-muted-foreground">Buscando...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y rounded border">
        {results.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <p className="font-medium">{u.name}</p>
              <p className="text-xs text-muted-foreground">
                {u.email} · {u.role}
              </p>
            </div>
            <Button size="sm" onClick={() => impersonate(u.email)}>
              Ver como este
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
