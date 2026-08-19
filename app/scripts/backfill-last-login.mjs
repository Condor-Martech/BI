#!/usr/bin/env node
// Backfill User.lastLogin desde loginlogs históricos.
// Cierra el gap para usuarios con registros en `loginlogs` previos al double-write
// en login-log.service.ts (que setea User.lastLogin en cada login).
// Solo escribe cuando lastLogin es null / no existe — nunca pisa un valor real.
// Uso:
//   node app/scripts/backfill-last-login.mjs [--dry-run] [--uri mongodb://...]
// Env:
//   MONGO_DSN  (default: mongodb://localhost:27017/app)

import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag("help") || hasFlag("h")) {
  console.error("uso: node app/scripts/backfill-last-login.mjs [--dry-run] [--uri mongodb://...]");
  process.exit(1);
}

const uri = getFlag("uri") ?? process.env.MONGO_DSN ?? "mongodb://localhost:27017/app";
const dryRun = hasFlag("dry-run");

const client = new MongoClient(uri);

let exitCode = 0;

try {
  await client.connect();
  const db = client.db();
  const users = db.collection("users");
  const logins = db.collection("loginlogs");

  // Agrega loginlogs por userId (userId es array de ObjectId — $unwind primero)
  // y toma el loginTime más reciente. loginTime está guardado como string en
  // TZ America/Sao_Paulo por LoginLogService.registerLoginLog — new Date(...)
  // parsea el ISO devuelto por Date.prototype.toISOString/toString correctamente.
  const agg = await logins.aggregate([
    { $unwind: "$userId" },
    {
      $group: {
        _id: "$userId",
        maxLoginTime: { $max: "$loginTime" },
      },
    },
  ]).toArray();

  const lastByUser = new Map();
  for (const row of agg) {
    if (!row._id) continue;
    lastByUser.set(String(row._id), row.maxLoginTime);
  }

  // Solo tocamos usuarios sin lastLogin (null o ausente) — idempotente.
  const candidates = await users
    .find(
      { $or: [{ lastLogin: null }, { lastLogin: { $exists: false } }] },
      { projection: { _id: 1, email: 1, name: 1, lastLogin: 1 } },
    )
    .toArray();

  const scanned = candidates.length;
  let updated = 0;
  let noLogs = 0;
  const previews = [];

  for (const user of candidates) {
    const raw = lastByUser.get(String(user._id));
    if (!raw) {
      noLogs++;
      continue;
    }

    const parsed = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      console.error(`skip: loginTime inválido para ${user.email ?? user._id}: ${raw}`);
      noLogs++;
      continue;
    }

    if (dryRun) {
      previews.push({
        _id: user._id,
        email: user.email ?? "(sin email)",
        name: user.name ?? "(sin nombre)",
        lastLogin: parsed.toISOString(),
      });
    } else {
      await users.updateOne(
        { _id: user._id },
        { $set: { lastLogin: parsed } },
      );
    }
    updated++;
  }

  // Cuántos ya tenían lastLogin real (skipped-already-has-lastLogin).
  const alreadyHad = await users.countDocuments({
    lastLogin: { $ne: null, $exists: true },
  });

  console.log("----------------------------------------");
  console.log(`mode:                          ${dryRun ? "DRY-RUN (no writes)" : "APPLY"}`);
  console.log(`uri:                           ${uri.replace(/\/\/[^@]+@/, "//<redacted>@")}`);
  console.log(`users scanned (no lastLogin):  ${scanned}`);
  console.log(`users updated:                 ${updated}`);
  console.log(`users w/ no loginlogs:         ${noLogs}`);
  console.log(`users already had lastLogin:   ${alreadyHad}`);
  console.log("----------------------------------------");

  if (dryRun && previews.length) {
    console.log("preview (first 20):");
    for (const p of previews.slice(0, 20)) {
      console.log(`  ${p._id}  ${p.email.padEnd(40)}  -> ${p.lastLogin}`);
    }
    if (previews.length > 20) {
      console.log(`  ... y ${previews.length - 20} más`);
    }
    console.log("----------------------------------------");
  }
} catch (err) {
  console.error("error:", err?.message ?? err);
  exitCode = 1;
} finally {
  await client.close();
}

process.exit(exitCode);
