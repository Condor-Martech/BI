#!/usr/bin/env node
// Dedupe de documentos Report duplicados por reportIdPB.
// Contexto: antes del fix P0-1 en reports.service.ts::createMany, cada corrida de
// POST /reports/syncronize hacía INSERT en vez de UPSERT, dejando N copias del
// mismo reportIdPB en la colección "reports" con distintos _id. La UI mostraba
// duplicados porque User.report (virtual populate) resuelve por reportIdPB.
//
// Ahora los futuros syncs son idempotentes, pero los duplicados históricos siguen
// en Mongo. Este script los limpia dejando UNO por reportIdPB (el _id más antiguo,
// que en ObjectId equivale al insertado primero).
//
// SEGURO POR DEFAULT: corre en dry-run. Necesitás pasar --apply para borrar.
//
// User.reportsByPB y Group.reports almacenan reportIdPB (string), NO refs por _id,
// entonces borrar los duplicados es transparente para esas relaciones.
//
// Uso:
//   node app/scripts/dedupe-reports.mjs [--apply] [--uri mongodb://...]
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
  const reports = db.collection("reports");

  const totalBefore = await reports.countDocuments();

  const duplicates = await reports
    .aggregate([
      {
        $group: {
          _id: "$reportIdPB",
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  if (duplicates.length === 0) {
    console.log("✓ Sin duplicados. Nada por hacer.");
    console.log(`  reports totales: ${totalBefore}`);
    process.exit(0);
  }

  console.log(`Modo: ${apply ? "APPLY (borra)" : "DRY-RUN (solo reporta)"}`);
  console.log(`Reports totales antes: ${totalBefore}`);
  console.log(`Grupos de duplicados encontrados: ${duplicates.length}`);
  console.log("----------------------------------------");

  let idsToDelete = [];
  let sampleShown = 0;

  for (const dup of duplicates) {
    // Sort ObjectIds: el primero (más viejo) se preserva, el resto se borra.
    const sorted = dup.ids.map((id) => id.toString()).sort();
    const keep = sorted[0];
    const remove = sorted.slice(1);

    idsToDelete.push(...remove);

    if (sampleShown < 10) {
      // Traigo el nombre del que preservo para dar contexto legible.
      const kept = await reports.findOne(
        { _id: dup.ids.find((id) => id.toString() === keep) },
        { projection: { name: 1 } },
      );
      console.log(
        `  reportIdPB=${dup._id}  count=${dup.count}  keep=${keep}  remove=${remove.length}  name="${kept?.name ?? "?"}"`,
      );
      sampleShown++;
    }
  }
  if (duplicates.length > sampleShown) {
    console.log(`  ... y ${duplicates.length - sampleShown} más`);
  }

  console.log("----------------------------------------");
  console.log(`Total docs a borrar: ${idsToDelete.length}`);
  console.log(`Reports que quedarán: ${totalBefore - idsToDelete.length}`);

  if (!apply) {
    console.log("\nDRY-RUN — nada fue modificado.");
    console.log("Corré de nuevo con --apply para ejecutar.");
    process.exit(0);
  }

  // Convertir strings de vuelta a ObjectId para el deleteMany.
  const { ObjectId } = await import("mongodb");
  const objectIds = idsToDelete.map((id) => new ObjectId(id));

  const result = await reports.deleteMany({ _id: { $in: objectIds } });
  const totalAfter = await reports.countDocuments();

  console.log("----------------------------------------");
  console.log(`✓ Borrados: ${result.deletedCount}`);
  console.log(`  reports antes:   ${totalBefore}`);
  console.log(`  reports después: ${totalAfter}`);
} finally {
  await client.close();
}
