#!/usr/bin/env node
// Cleanup de referências órfãs em users.reportsByPB.
//
// Remove de user.reportsByPB todo reportIdPB que não tem doc correspondente
// em reports. Complemento do fix em users.service.ts::updateUserReports (agora
// tolerante a órfãos): sem esse cleanup, a UI de Permissões continuaria
// mostrando "N selecionados" incluindo os fantasmas que o backend já filtra
// silenciosamente. Aqui deixamos o Set do frontend em sincronia com a realidade.
//
// SEGURO POR DEFAULT: dry-run. Passe --apply para executar.
//
// Uso:
//   node app/scripts/cleanup-orphan-reports-refs.mjs [--apply] [--uri mongodb://...]
// Env:
//   MONGO_DSN    (default: mongodb://localhost:27017/app)

import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const apply = args.includes("--apply");
const uri = getFlag("uri") ?? process.env.MONGO_DSN ?? "mongodb://localhost:27017/app";

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db();
  const users = db.collection("users");
  const reports = db.collection("reports");

  const validReportIds = new Set(
    (await reports.find({}, { projection: { reportIdPB: 1 } }).toArray())
      .map((r) => r.reportIdPB)
      .filter(Boolean),
  );
  console.log(`Reports válidos na base: ${validReportIds.size}`);

  const cursor = users.find(
    { reportsByPB: { $exists: true, $ne: [] } },
    { projection: { email: 1, reportsByPB: 1 } },
  );

  const updates = [];
  let totalOrphansRemoved = 0;
  let totalDupesRemoved = 0;
  let sampleShown = 0;

  for await (const u of cursor) {
    const orig = u.reportsByPB ?? [];
    // Dedupe + filtra órfãos no mesmo passe.
    const clean = Array.from(new Set(orig.filter((id) => validReportIds.has(id))));
    const removed = orig.length - clean.length;
    if (removed === 0) continue;

    // Distingue órfãos vs duplicados para observabilidade.
    const uniqueOrig = new Set(orig);
    const orphans = orig.filter((id) => !validReportIds.has(id)).length;
    const dupes = orig.length - uniqueOrig.size;

    totalOrphansRemoved += orphans;
    totalDupesRemoved += dupes;
    updates.push({ _id: u._id, email: u.email, clean });

    if (sampleShown < 20) {
      console.log(
        `  ${u.email}: ${orig.length} → ${clean.length} (órfãos: ${orphans}, dupes: ${dupes})`,
      );
      sampleShown++;
    }
  }
  if (updates.length > sampleShown) {
    console.log(`  ... e mais ${updates.length - sampleShown} usuários`);
  }

  console.log("----------------------------------------");
  console.log(`Modo: ${apply ? "APPLY (atualiza)" : "DRY-RUN (só reporta)"}`);
  console.log(`Usuários afetados: ${updates.length}`);
  console.log(`Referências órfãs a remover: ${totalOrphansRemoved}`);
  console.log(`Duplicatas a remover:        ${totalDupesRemoved}`);

  if (!apply) {
    console.log("\nDRY-RUN — nada foi modificado.");
    console.log("Corra novamente com --apply para executar.");
    process.exit(0);
  }

  if (updates.length === 0) {
    console.log("Nada por atualizar.");
    process.exit(0);
  }

  const bulk = users.initializeUnorderedBulkOp();
  for (const u of updates) {
    bulk.find({ _id: u._id }).updateOne({ $set: { reportsByPB: u.clean } });
  }
  const result = await bulk.execute();

  console.log("----------------------------------------");
  console.log(`✓ Users atualizados: ${result.modifiedCount}`);
} finally {
  await client.close();
}
