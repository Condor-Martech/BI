// Versão mongosh do cleanup de referências órfãs em users.reportsByPB.
//
// Não roda direto — é chamada pelo wrapper `prod-mongo-run.sh`, que injeta
// uma linha inicial `const APPLY = true|false;` antes do conteúdo deste arquivo.
//
// Complemento do fix em users.service.ts::updateUserReports (agora tolerante).
// Sem esse cleanup, a UI de Permissões continuaria mostrando "N selecionados"
// incluindo os fantasmas que o backend já filtra silenciosamente.

const validReportIds = new Set(
  db.reports.find({}, { reportIdPB: 1 })
    .toArray()
    .map((r) => r.reportIdPB)
    .filter(Boolean),
);
print(`Reports válidos na base: ${validReportIds.size}`);

const cursor = db.users.find(
  { reportsByPB: { $exists: true, $ne: [] } },
  { email: 1, reportsByPB: 1 },
);

const updates = [];
let totalOrphansRemoved = 0;
let totalDupesRemoved = 0;
let sampleShown = 0;

cursor.forEach((u) => {
  const orig = u.reportsByPB || [];
  const clean = Array.from(new Set(orig.filter((id) => validReportIds.has(id))));
  const removed = orig.length - clean.length;
  if (removed === 0) return;

  const uniqueOrig = new Set(orig);
  const orphans = orig.filter((id) => !validReportIds.has(id)).length;
  const dupes = orig.length - uniqueOrig.size;

  totalOrphansRemoved += orphans;
  totalDupesRemoved += dupes;
  updates.push({ _id: u._id, email: u.email, clean });

  if (sampleShown < 20) {
    print(`  ${u.email}: ${orig.length} → ${clean.length} (órfãos: ${orphans}, dupes: ${dupes})`);
    sampleShown++;
  }
});

if (updates.length > sampleShown) {
  print(`  ... e mais ${updates.length - sampleShown} usuários`);
}

print("----------------------------------------");
print(`Modo: ${APPLY ? "APPLY (atualiza)" : "DRY-RUN (só reporta)"}`);
print(`Usuários afetados: ${updates.length}`);
print(`Referências órfãs a remover: ${totalOrphansRemoved}`);
print(`Duplicatas a remover:        ${totalDupesRemoved}`);

if (!APPLY) {
  print("\nDRY-RUN — nada foi modificado.");
} else if (updates.length === 0) {
  print("Nada por atualizar.");
} else {
  const ops = updates.map((u) => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { reportsByPB: u.clean } },
    },
  }));
  const result = db.users.bulkWrite(ops, { ordered: false });
  print("----------------------------------------");
  print(`✓ Users atualizados: ${result.modifiedCount}`);
}
