"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Item {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function AllowlistTable() {
  const [items, setItems] = useState<Item[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/allowlist");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const body = (await res.json()) as { items: Item[] };
      setItems(body.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    setError(null);
    const res = await fetch("/api/admin/allowlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Erro ${res.status}`);
      return;
    }
    setNewEmail("");
    refresh();
  }

  async function remove(email: string) {
    if (!confirm(`Remover acesso admin de ${email}?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/allowlist/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `Erro ${res.status}`);
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="email@condor.com.br"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <Button onClick={add} disabled={!newEmail}>Dar acesso</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Email</th>
              <th className="py-2">Nome</th>
              <th className="py-2">Rol</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.name}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2 text-right">
                  <Button variant="destructive" size="sm" onClick={() => remove(u.email)}>Remover</Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  Ninguém tem acesso ainda (além do super admin).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
