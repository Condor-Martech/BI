import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PermissionsService } from '../../core/permissions/permissions.service';
import { Account, AccountDocument } from '../accounts/account.entity';
import { Group, GroupsDocument } from '../groups/group.entity';
import { Report, ReportDocument } from '../reports/report.entity';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { UserDocument } from '../users/user.entity';

export interface SidebarWorkspace {
  id: string;
  pbWorkspaceId: string;
  name: string;
}

export interface SidebarAccount {
  id: string;
  name: string;
  workspaces: SidebarWorkspace[];
}

export interface MeReport {
  id: string;
  workspaceId: string;
  pbReportId: string;
  name: string;
  embedUrl: string;
  webUrl: string;
  lastSyncedAt: string | null;
}

@Injectable()
export class MeService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<GroupsDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Returns the sidebar tree (accounts + workspaces) for the authenticated user.
   *
   * - MANAGER / ADMIN: every account and every workspace.
   * - USER: only accounts referenced in `user.accountID`, with all of their
   *   workspaces. Per-report RBAC is enforced downstream in the workspace page,
   *   not here.
   *
   * Implemented at the model layer (not via AccountsService / GroupsService) to
   * avoid Azure refresh-token side effects on a read-only navigation call.
   */
  async getSidebar(user: UserDocument): Promise<SidebarAccount[]> {
    const privileged = user.role === ROLE_TYPES.MANAGER || user.role === ROLE_TYPES.ADMIN;

    const accountFilter = privileged
      ? {}
      : { _id: { $in: (user.accountID ?? []).map((id) => new Types.ObjectId(id)) } };

    const accounts = await this.accountModel
      .find(accountFilter)
      .select('_id nameAccount email')
      .lean()
      .exec();

    if (accounts.length === 0) return [];

    // MANAGER / ADMIN: árbol completo por cuenta (cada "cuenta" = credencial Azure).
    if (privileged) {
      const accountIds = accounts.map((a) => String(a._id));
      const groups = await this.groupModel
        .find({ accountId: { $in: accountIds } })
        .select('_id groupIdPB accountId name')
        .lean()
        .exec();
      const groupsByAccount = new Map<string, SidebarWorkspace[]>();
      for (const g of groups) {
        const key = String(g.accountId);
        const list = groupsByAccount.get(key) ?? [];
        list.push({ id: String(g._id), pbWorkspaceId: g.groupIdPB, name: g.name });
        groupsByAccount.set(key, list);
      }
      return accounts.map((a) => ({
        id: String(a._id),
        name: a.nameAccount || a.email,
        workspaces: (groupsByAccount.get(String(a._id)) ?? []).sort((x, y) =>
          x.name.localeCompare(y.name),
        ),
      }));
    }

    // USER: el sidebar no expone credenciales Azure, solo workspaces. La autoridad
    // de permisos son reportsByPB + userGroups.reports — user.accountID NO define
    // qué puede ver, es un mecanismo de LOAD BALANCING: Power BI bloquea al superar
    // ~70 sesiones concurrentes con el mismo service account, así que los users se
    // distribuyen entre N accounts Azure con licencias/permisos equivalentes sobre
    // los mismos workspaces del tenant. Filtrar groups por accountId acá restringía
    // por "qué pool de tokens le tocó al user" — cero relación con visibilidad. Un
    // mismo workspace vive replicado bajo N cuentas; buscamos los groups por
    // groupIdPB permitido y deduplicamos por pbWorkspaceId. Resultado plano
    // (una sola "cuenta" sintética).
    const allowed = [...(await this.permissions.getAllowedReportIds(user))];
    if (allowed.length === 0) return [];
    // /me/* nunca expõe reports ocultos (soft-hide via MANAGER). Se um workspace
    // só tiver reports ocultos, ele NÃO deve aparecer no sidebar do USER — daí o
    // filtro `hiddenByAdmin: { $ne: true }` acompanhar o distinct de groupIdPB.
    const allowedWorkspaces = (
      await this.reportModel.distinct('groupIdPB', {
        reportIdPB: { $in: allowed },
        hiddenByAdmin: { $ne: true },
      })
    ).map((id) => String(id));
    if (allowedWorkspaces.length === 0) return [];

    const wsGroups = await this.groupModel
      .find({ groupIdPB: { $in: allowedWorkspaces } })
      .select('_id groupIdPB name')
      .lean()
      .exec();

    const seen = new Set<string>();
    const workspaces: SidebarWorkspace[] = [];
    for (const g of wsGroups) {
      const wsId = String(g.groupIdPB);
      if (seen.has(wsId)) continue;
      seen.add(wsId);
      workspaces.push({ id: String(g._id), pbWorkspaceId: g.groupIdPB, name: g.name });
    }
    if (workspaces.length === 0) return [];
    workspaces.sort((x, y) => x.name.localeCompare(y.name));

    return [{ id: '__me__', name: 'Meus workspaces', workspaces }];
  }

  /**
   * Lista los reports accesibles al usuario dentro de un workspace de Power BI.
   *
   * - MANAGER / ADMIN: todos los reports cuyo `groupIdPB === pbWorkspaceId`.
   * - USER: la intersección de los reports permitidos (directos ∪ grupo) con los
   *   del workspace pedido. Resolución en vivo via PermissionsService.
   */
  async getReports(user: UserDocument, pbWorkspaceId: string): Promise<MeReport[]> {
    // /me/reports nunca expõe reports ocultos, independente do papel do usuário.
    // O caminho MANAGER que precisa ver ocultos é /reports/all?includeHidden=true.
    const baseFilter: Record<string, unknown> = {
      groupIdPB: pbWorkspaceId,
      hiddenByAdmin: { $ne: true },
    };

    if (!this.permissions.isPrivileged(user)) {
      const allowed = [...(await this.permissions.getAllowedReportIds(user))];
      if (allowed.length === 0) return [];
      baseFilter.reportIdPB = { $in: allowed };
    }

    const reports = await this.reportModel
      .find(baseFilter)
      .select('_id reportIdPB groupIdPB name embedUrl webUrl updatedAt')
      .lean()
      .exec();

    return reports
      .map((r) => ({
        id: String(r._id),
        workspaceId: r.groupIdPB ?? pbWorkspaceId,
        pbReportId: r.reportIdPB,
        name: r.name,
        embedUrl: r.embedUrl,
        webUrl: r.webUrl,
        lastSyncedAt:
          (r as { updatedAt?: Date }).updatedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Contadores para el card de resumen del dashboard del usuario autenticado.
   *
   * Se cuentan IDs ÚNICOS, no documentos: la colección `reports` replica el mismo
   * `reportIdPB` bajo varias cuentas, así que `countDocuments` inflaría el total.
   *
   * - USER: reportes permitidos (directos ∪ grupo) y workspaces que realmente ve en
   *   el sidebar (mismo filtro de cuenta + dedup → los números coinciden con la UI).
   * - MANAGER / ADMIN: todos los reportes y workspaces distintos.
   */
  async getOverview(
    user: UserDocument,
  ): Promise<{ assignedReports: number; workspaces: number }> {
    const privileged = user.role === ROLE_TYPES.MANAGER || user.role === ROLE_TYPES.ADMIN;

    if (privileged) {
      // Contadores do /me/overview refletem o que o usuário vê nas listagens
      // (sidebar + /me/reports) — ocultos ficam fora, alinhado com findAll(false)
      // e com /reports/all sem includeHidden.
      const notHidden = { hiddenByAdmin: { $ne: true } };
      const [reportIds, workspaceIds] = await Promise.all([
        this.reportModel.distinct('reportIdPB', notHidden),
        this.reportModel.distinct('groupIdPB', notHidden),
      ]);
      return { assignedReports: reportIds.length, workspaces: workspaceIds.length };
    }

    const allowed = await this.permissions.getAllowedReportIds(user);
    const sidebar = await this.getSidebar(user);
    const workspaces = sidebar.reduce((sum, account) => sum + account.workspaces.length, 0);
    // getAllowedReportIds devolve o conjunto bruto de permissões — não conhece
    // `hiddenByAdmin`. Contar `allowed.size` inflaria o contador com reports que
    // o USER não vê no /me/reports. Reduzimos ao subconjunto visível.
    const allowedIds = [...allowed];
    if (allowedIds.length === 0) {
      return { assignedReports: 0, workspaces };
    }
    const visibleReportIds = await this.reportModel.distinct('reportIdPB', {
      reportIdPB: { $in: allowedIds },
      hiddenByAdmin: { $ne: true },
    });
    return { assignedReports: visibleReportIds.length, workspaces };
  }
}
