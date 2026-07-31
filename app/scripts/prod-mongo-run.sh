#!/usr/bin/env bash
# Executa operações de higienização contra o Mongo de produção sem expor portas
# nem instalar nada no server. Pipe SSH → docker exec (mongosh | mongodump | mongorestore)
# contra o container do stack Swarm.
#
# Uso:
#   ./prod-mongo-run.sh backup                     # dump users → arquivo local
#   ./prod-mongo-run.sh cleanup                    # dry-run (não modifica)
#   ./prod-mongo-run.sh cleanup --apply            # aplica limpeza
#   ./prod-mongo-run.sh restore <arquivo.archive>  # rollback do backup
#   ./prod-mongo-run.sh verify                     # confere orphans/dupes residuais
#
# Env vars (opcional — os defaults refletem o setup atual):
#   PROD_SSH_HOST   default: ubuntu@204.216.139.225
#   MONGO_URI       default: mongodb://mongo:27017/powerbi?authSource=admin
#   MONGO_SERVICE   default: bi-new_mongo   (prefixo do service Swarm)

set -euo pipefail

SSH_HOST="${PROD_SSH_HOST:-ubuntu@204.216.139.225}"
MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/powerbi}"
MONGO_SERVICE="${MONGO_SERVICE:-bi-new_mongo}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mode="${1:-}"
shift || true

if [[ -z "$mode" ]]; then
  cat <<EOF >&2
Uso: $0 {backup|cleanup [--apply]|restore <arquivo>|verify}

Env: PROD_SSH_HOST, MONGO_URI, MONGO_SERVICE (todos opcionais).
EOF
  exit 1
fi

# Descobre o nome real do container (Swarm sufixa .1.<hash>, muda a cada redeploy).
container=$(ssh -o StrictHostKeyChecking=accept-new "$SSH_HOST" \
  "docker ps --filter 'name=${MONGO_SERVICE}' --format '{{.Names}}' | head -1")
if [[ -z "$container" ]]; then
  echo "✗ Container com prefixo '${MONGO_SERVICE}' não encontrado em $SSH_HOST" >&2
  exit 1
fi
echo "→ Host:      $SSH_HOST"
echo "→ Container: $container"
echo "→ URI:       $MONGO_URI"
echo

case "$mode" in
  backup)
    stamp=$(date +%Y%m%d-%H%M%S)
    outfile="./backup-users-${stamp}.archive"
    echo "→ mongodump users → $outfile"
    ssh "$SSH_HOST" \
      "docker exec $container mongodump --uri='$MONGO_URI' --db=powerbi --collection=users --archive --quiet" \
      > "$outfile"
    size=$(du -h "$outfile" | cut -f1)
    echo "✓ Backup salvo: $outfile ($size)"
    ;;

  cleanup)
    apply=false
    if [[ "${1:-}" == "--apply" ]]; then
      apply=true
    fi

    if $apply; then
      echo "⚠  MODO: APPLY — vai modificar users.reportsByPB em produção."
      echo "   Certifique-se de ter feito backup: $0 backup"
      read -r -p "   Digite 'apply' para confirmar: " confirm
      [[ "$confirm" == "apply" ]] || { echo "Cancelado."; exit 1; }
      echo
    else
      echo "→ MODO: DRY-RUN (nada será modificado)"
      echo
    fi

    # Injeta a flag APPLY antes do script mongosh.
    { echo "const APPLY = ${apply};"; cat "$SCRIPT_DIR/cleanup-orphan-reports-refs.mongo.js"; } \
      | ssh "$SSH_HOST" "docker exec -i $container mongosh --quiet '$MONGO_URI'"
    ;;

  restore)
    archive="${1:-}"
    if [[ -z "$archive" || ! -f "$archive" ]]; then
      echo "✗ Arquivo não encontrado: ${archive:-<vazio>}" >&2
      echo "Uso: $0 restore <arquivo.archive>" >&2
      exit 1
    fi
    size=$(du -h "$archive" | cut -f1)
    echo "⚠  MODO: RESTORE — vai substituir a collection users completa."
    echo "   Origem: $archive ($size)"
    read -r -p "   Digite 'restore' para confirmar: " confirm
    [[ "$confirm" == "restore" ]] || { echo "Cancelado."; exit 1; }
    echo
    cat "$archive" | ssh "$SSH_HOST" \
      "docker exec -i $container mongorestore --uri='$MONGO_URI' --drop --archive --nsInclude='powerbi.users' --quiet"
    echo "✓ Restore concluído"
    ;;

  verify)
    echo "→ Verificação post-cleanup (esperado: 0 orphans, 0 dupes)"
    ssh "$SSH_HOST" "docker exec -i $container mongosh --quiet '$MONGO_URI'" <<'EOF'
const withOrphans = db.users.aggregate([
  { $match: { reportsByPB: { $exists: true, $ne: [] } } },
  { $lookup: { from: "reports", localField: "reportsByPB", foreignField: "reportIdPB", as: "m" } },
  { $project: { orphans: { $setDifference: ["$reportsByPB", "$m.reportIdPB"] } } },
  { $match: { "orphans.0": { $exists: true } } },
  { $count: "n" }
]).toArray();

const withDupes = db.users.aggregate([
  { $match: { reportsByPB: { $exists: true, $ne: [] } } },
  { $project: {
      dupes: { $subtract: [
        { $size: "$reportsByPB" },
        { $size: { $setUnion: ["$reportsByPB", []] } }
      ]}
  }},
  { $match: { dupes: { $gt: 0 } } },
  { $count: "n" }
]).toArray();

print(`Users com orphans residuais: ${withOrphans[0]?.n ?? 0}`);
print(`Users com dupes residuais:   ${withDupes[0]?.n ?? 0}`);
EOF
    ;;

  *)
    echo "✗ Modo desconhecido: $mode" >&2
    echo "Uso: $0 {backup|cleanup [--apply]|restore <arquivo>|verify}" >&2
    exit 1
    ;;
esac
