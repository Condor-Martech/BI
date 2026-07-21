"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResetResult {
  email: string;
  password: string;
  resetAt: string;
}

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [length, setLength] = useState<number>(12);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, length }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erro ${res.status}`);
      }
      setResult(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email do usuário</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@condor.com.br"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="length">Comprimento da senha</Label>
          <Input
            id="length"
            type="number"
            min={8}
            max={64}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Gerando..." : "Resetar senha"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Senha gerada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Email</Label>
              <p className="font-mono">{result.email}</p>
            </div>
            <div>
              <Label>Nova senha</Label>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono">{result.password}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(result.password)}
                >
                  Copiar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ⚠️ Esta senha não será mostrada novamente. Copie agora.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
