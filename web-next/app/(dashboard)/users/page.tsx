import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiServer } from "@/lib/api/server";
import { ApiAuthError } from "@/lib/api/types";
import { userListItemSchema, usersKeys } from "@/lib/api/endpoints/users";

import { UsersPageClient } from "./users-page-client";

/**
 * Server Component: prefetcha a lista de usuários no servidor e hidrata o cache
 * do TanStack Query, eliminando o waterfall pós-hidratação (o fetch deixa de
 * esperar o JS do cliente — a lista chega já pintada no primeiro frame).
 *
 * A queryKey `usersKeys.list()` (= ["users","list",{}]) coincide com a key inicial
 * do `useUsers()` no cliente: os params iniciais são todos `undefined`, e o hash de
 * keys do TanStack omite valores `undefined`, então ambas resolvem ao mesmo {}.
 */
export default async function UsersPage() {
  const queryClient = new QueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: usersKeys.list(),
      queryFn: async () => {
        // Direto ao legacy (sem round-trip pelo BFF). Mesmo shape que o hook client.
        const data = await apiServer<unknown>("/users/all");
        return z.array(userListItemSchema).parse(data);
      },
    });
  } catch (err) {
    // RSC não pode renovar token: 401 → login. Outros erros não bloqueiam a página;
    // o `useUsers()` no cliente refetcha e exibe seu próprio estado de erro.
    if (err instanceof ApiAuthError) redirect("/login");
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UsersPageClient />
    </HydrationBoundary>
  );
}
