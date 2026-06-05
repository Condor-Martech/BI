"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import {
  userListItemSchema,
  usersKeys,
  type ChangePasswordBody,
  type CreateUserBody,
  type ListUsersParams,
  type UpdateUserBody,
  type UserListItem,
} from "@/lib/api/endpoints/users";

function buildUsersQuery(params?: ListUsersParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.role) qs.set("role", params.role);
  if (params.lastLoginFrom) qs.set("lastLoginFrom", params.lastLoginFrom);
  if (params.lastLoginTo) qs.set("lastLoginTo", params.lastLoginTo);
  const str = qs.toString();
  return str ? `?${str}` : "";
}

/** GET /api/users/all — MANAGER only. */
export function useUsers(params?: ListUsersParams) {
  return useQuery<UserListItem[]>({
    queryKey: usersKeys.list(params),
    queryFn: async () => {
      const data = await apiClient(`/api/users/all${buildUsersQuery(params)}`);
      return z.array(userListItemSchema).parse(data);
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) =>
      apiClient("/api/users/create", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      apiClient(`/api/users/update/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/users/delete/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiClient("/api/users/change-password", { method: "PATCH", body }),
  });
}

/**
 * PATCH /api/users/:userId/account — MANAGER only.
 * Move o usuário para a conta BI informada: o backend remove das contas atuais
 * e vincula à de destino, sincronizando os dois lados da relação.
 */
export function useChangeUserAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, accountId }: { userId: string; accountId: string }) =>
      apiClient(`/api/users/${encodeURIComponent(userId)}/account`, {
        method: "PATCH",
        body: { accountId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

/**
 * PATCH /api/users/:userId/reports — MANAGER only.
 * Body: `{ reportIdPB: string[] }`. Backend derives `groupIdPB` from the reports automatically.
 */
export function useUpdateUserReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reportIdPB }: { userId: string; reportIdPB: string[] }) =>
      apiClient(`/api/users/${encodeURIComponent(userId)}/reports`, {
        method: "PATCH",
        body: { reportIdPB },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}
