"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROLES,
  type CreateUserBody,
  type Role,
  type UpdateUserBody,
  type UserListItem,
} from "@/lib/api/endpoints/users";
import { useAccounts } from "@/lib/hooks/accounts";
import { useChangeUserAccount, useCreateUser, useUpdateUser } from "@/lib/hooks/users";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When present → edit mode; absent → create mode. */
  user?: UserListItem;
}

const ROLE_LABELS: Record<Role, string> = {
  manager: "Manager — acesso total",
  admin: "Admin — gestão de conteúdo",
  user: "User — apenas leitura de relatórios",
};

/** Primeira conta BI vinculada ao usuário (o modelo é multi-conta, mas tratamos como uma só). */
function currentAccountId(user?: UserListItem): string {
  const first = user?.accountID?.[0];
  if (!first) return "";
  return typeof first === "string" ? first : (first._id ?? "");
}

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  const isEdit = Boolean(user);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [accountId, setAccountId] = useState("");
  const [userIslv, setUserIslv] = useState("");

  const create = useCreateUser();
  const update = useUpdateUser();
  const changeAccount = useChangeUserAccount();
  const isPending = create.isPending || update.isPending || changeAccount.isPending;

  // A conta BI aplica-se à função "user", tanto na criação quanto na edição.
  const needsAccount = role === "user";
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
      setRole(((user?.role as Role) ?? "user") as Role);
      setAccountId(currentAccountId(user));
      setUserIslv(user?.userIslv ?? "");
    }
  }, [open, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEdit && user?._id) {
      const body: UpdateUserBody = { name, email, role, userIslv: userIslv || undefined };
      // A troca de conta é um endpoint à parte (sincroniza os dois lados da relação).
      const accountChanged =
        role === "user" && Boolean(accountId) && accountId !== currentAccountId(user);
      try {
        await update.mutateAsync({ id: user._id, body });
        if (accountChanged) {
          await changeAccount.mutateAsync({ userId: user._id, accountId });
        }
        toast.success("Usuário atualizado.");
        onOpenChange(false);
      } catch (err) {
        toast.error((err as Error).message ?? "Erro ao atualizar.");
      }
      return;
    }

    // Criação: o backend vincula a conta pelo email (campo accountUser).
    const selectedAccount = accounts.find((a) => a._id === accountId);
    const body: CreateUserBody = {
      name,
      email,
      role,
      ...(role === "user" && selectedAccount ? { accountUser: selectedAccount.email } : {}),
      ...(userIslv ? { userIslv } : {}),
    };
    create.mutate(body, {
      onSuccess: () => {
        toast.success("Usuário criado. A senha foi enviada por e-mail.");
        onOpenChange(false);
      },
      onError: (err) => toast.error((err as Error).message ?? "Erro ao criar."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuário" : "Criar usuário"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Altere os dados do usuário. Os campos vazios não são atualizados."
              : "O backend gera a senha inicial e a envia para o e-mail do usuário."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsAccount && (
            <div className="space-y-1.5">
              <Label htmlFor="accountUser">Conta BI</Label>
              <Select
                value={accountId}
                onValueChange={setAccountId}
                disabled={accountsQuery.isLoading || accountsQuery.isError}
                required
              >
                <SelectTrigger id="accountUser">
                  <SelectValue
                    placeholder={
                      accountsQuery.isLoading
                        ? "Carregando contas…"
                        : accountsQuery.isError
                          ? "Não foi possível carregar as contas"
                          : accounts.length === 0
                            ? "Não há contas BI carregadas"
                            : "Selecione uma conta"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.nameAccount}
                      <span className="ml-2 text-xs text-muted-foreground">{a.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? "Trocar a conta move o usuário: ele sai da conta atual e passa para a selecionada."
                  : 'Obrigatório para a função "user". Vincula o usuário a uma conta Power BI.'}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="userIslv">Código ISLV (opcional)</Label>
            <Input
              id="userIslv"
              value={userIslv}
              onChange={(e) => setUserIslv(e.target.value)}
              placeholder="ABC123"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
