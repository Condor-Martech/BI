#!/usr/bin/env node
// Diagnóstico READ-ONLY de las colecciones `users` y `loginlogs`.
// Reporta la forma real (tipos, nulos, orphans, mismatches) para decidir cuán
// defensivos deben ser dos fixes subsiguientes (uno de ellos: el backfill de
// User.lastLogin — mismo dataset que consume backfill-last-login.mjs).
//
// NO escribe nada. No updateX, no insertX, no deleteX, no bulkWrite.
//
// Uso:
//   node app/scripts/diagnose-login-data.mjs [--uri mongodb://...]
//
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
  console.error("uso: node app/scripts/diagnose-login-data.mjs [--uri mongodb://...]");
  process.exit(1);
}

const uri = getFlag("uri") ?? process.env.MONGO_DSN ?? "mongodb://localhost:27017/app";
const redactedUri = uri.replace(/\/\/[^@]+@/, "//<redacted>@");

const client = new MongoClient(uri);

function redactUser(u) {
  if (!u || typeof u !== "object") return u;
  const clone = { ...u };
  if ("password" in clone) clone.password = "<redacted>";
  if ("salt" in clone) clone.salt = "<redacted>";
  return clone;
}

function section(title) {
  console.log("");
  console.log("========================================");
  console.log(title);
  console.log("========================================");
}

function sub(title) {
  console.log("");
  console.log(`--- ${title} ---`);
}

let exitCode = 0;

try {
  await client.connect();
  const db = client.db();
  const users = db.collection("users");
  const logins = db.collection("loginlogs");

  console.log("----------------------------------------");
  console.log(`uri:  ${redactedUri}`);
  console.log(`db:   ${db.databaseName}`);
  console.log(`time: ${new Date().toISOString()}`);
  console.log("----------------------------------------");

  // ==========================================================================
  // USERS
  // ==========================================================================
  section("USERS");

  const usersTotal = await users.countDocuments({});
  console.log(`total documents: ${usersTotal}`);

  sub("lastLogin shape");
  const usersLastLoginNullOrMissing = await users.countDocuments({
    $or: [{ lastLogin: null }, { lastLogin: { $exists: false } }],
  });
  const usersLastLoginDate = await users.countDocuments({
    lastLogin: { $type: "date" },
  });
  const usersLastLoginString = await users.countDocuments({
    lastLogin: { $type: "string" },
  });
  console.log(`  null / missing:     ${usersLastLoginNullOrMissing}`);
  console.log(`  Date instance:      ${usersLastLoginDate}`);
  console.log(`  string (toString):  ${usersLastLoginString}`);
  const usersLastLoginOther =
    usersTotal - usersLastLoginNullOrMissing - usersLastLoginDate - usersLastLoginString;
  console.log(`  other type (delta): ${usersLastLoginOther}`);

  sub("role distribution (top 10)");
  const rolesAgg = await users
    .aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])
    .toArray();
  if (rolesAgg.length === 0) {
    console.log("  (no roles found)");
  } else {
    for (const r of rolesAgg) {
      const label = r._id === null || r._id === undefined ? "(null/missing)" : String(r._id);
      console.log(`  ${label.padEnd(24)} ${r.count}`);
    }
  }

  sub("missing email / name");
  const missingEmail = await users.countDocuments({
    $or: [{ email: null }, { email: { $exists: false } }, { email: "" }],
  });
  const missingName = await users.countDocuments({
    $or: [{ name: null }, { name: { $exists: false } }, { name: "" }],
  });
  console.log(`  missing/empty email: ${missingEmail}`);
  console.log(`  missing/empty name:  ${missingName}`);

  sub("sample users (3, password/salt redacted)");
  const sampleUsers = await users.find({}).limit(3).toArray();
  for (const u of sampleUsers) {
    console.log(JSON.stringify(redactUser(u), null, 2));
  }

  // ==========================================================================
  // LOGINLOGS
  // ==========================================================================
  section("LOGINLOGS");

  const loginsTotal = await logins.countDocuments({});
  console.log(`total documents: ${loginsTotal}`);

  sub("userId shape");
  const userIdArray = await logins.countDocuments({ userId: { $type: "array" } });
  const userIdObjectId = await logins.countDocuments({ userId: { $type: "objectId" } });
  const userIdString = await logins.countDocuments({ userId: { $type: "string" } });
  const userIdNullOrMissing = await logins.countDocuments({
    $or: [{ userId: null }, { userId: { $exists: false } }],
  });
  console.log(`  array:              ${userIdArray}`);
  console.log(`  single ObjectId:    ${userIdObjectId}`);
  console.log(`  string:             ${userIdString}`);
  console.log(`  null / missing:     ${userIdNullOrMissing}`);
  const userIdOther =
    loginsTotal - userIdArray - userIdObjectId - userIdString - userIdNullOrMissing;
  console.log(`  other type (delta): ${userIdOther}`);

  sub("userId array length distribution");
  const arrLenAgg = await logins
    .aggregate([
      { $match: { userId: { $type: "array" } } },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                { case: { $eq: [{ $size: "$userId" }, 0] }, then: "0" },
                { case: { $eq: [{ $size: "$userId" }, 1] }, then: "1" },
                { case: { $eq: [{ $size: "$userId" }, 2] }, then: "2" },
              ],
              default: "3+",
            },
          },
        },
      },
      { $group: { _id: "$bucket", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  if (arrLenAgg.length === 0) {
    console.log("  (no array-shaped userId docs)");
  } else {
    for (const b of arrLenAgg) {
      console.log(`  len ${String(b._id).padEnd(4)} ${b.count}`);
    }
  }

  sub("loginTime shape");
  const loginTimeDate = await logins.countDocuments({ loginTime: { $type: "date" } });
  const loginTimeString = await logins.countDocuments({ loginTime: { $type: "string" } });
  const loginTimeNullOrMissing = await logins.countDocuments({
    $or: [{ loginTime: null }, { loginTime: { $exists: false } }],
  });
  console.log(`  Date instance:      ${loginTimeDate}`);
  console.log(`  string:             ${loginTimeString}`);
  console.log(`  null / missing:     ${loginTimeNullOrMissing}`);
  const loginTimeOther =
    loginsTotal - loginTimeDate - loginTimeString - loginTimeNullOrMissing;
  console.log(`  other type (delta): ${loginTimeOther}`);

  sub("orphan loginlogs (userId → users._id no existe)");
  // Normalizamos userId a array (aunque venga como scalar), $unwind y $lookup
  // proyectando solo _id. Un log es orphan si TODOS los userId referenciados
  // no existen. Contamos logs, no referencias sueltas.
  const orphanAgg = await logins
    .aggregate([
      {
        $project: {
          userIdArr: {
            $cond: [
              { $isArray: "$userId" },
              "$userId",
              { $cond: [{ $eq: ["$userId", null] }, [], ["$userId"]] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userIdArr",
          foreignField: "_id",
          as: "matched",
          pipeline: [{ $project: { _id: 1 } }],
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gt: [{ $size: "$userIdArr" }, 0] },
              { $eq: [{ $size: "$matched" }, 0] },
            ],
          },
        },
      },
    ])
    .toArray();

  console.log(`  orphan loginlog docs: ${orphanAgg.length}`);
  const orphanSamples = orphanAgg.slice(0, 10);
  if (orphanSamples.length > 0) {
    console.log("  sample orphan _ids (10):");
    for (const o of orphanSamples) {
      console.log(`    log _id=${o._id}  userIdArr=${JSON.stringify(o.userIdArr)}`);
    }
  }
  // También: logs con userId completamente vacío (empty array o null / missing).
  const emptyUserIdLogs = await logins.countDocuments({
    $or: [
      { userId: null },
      { userId: { $exists: false } },
      { userId: { $size: 0 } },
    ],
  });
  console.log(`  loginlogs with empty/missing userId: ${emptyUserIdLogs}`);

  sub("sample loginlogs (5, RAW — no sanitize)");
  const sampleLogs = await logins.find({}).limit(5).toArray();
  for (const l of sampleLogs) {
    console.log(JSON.stringify(l, null, 2));
  }

  // ==========================================================================
  // CROSS-CHECKS
  // ==========================================================================
  section("CROSS-CHECKS");

  sub("users con lastLogin null AND >=1 loginlog (target del backfill)");
  // Reproducimos la lógica del backfill: agrupar loginlogs por userId (unwind),
  // luego contar users sin lastLogin que tengan match. Devuelve tanto el count
  // como una muestra de 5 emails.
  const nullLastLoginUsers = await users
    .find(
      { $or: [{ lastLogin: null }, { lastLogin: { $exists: false } }] },
      { projection: { _id: 1, email: 1 } },
    )
    .toArray();

  const loggedUserIds = new Set();
  const loggedAgg = await logins
    .aggregate([
      {
        $project: {
          userIdArr: {
            $cond: [
              { $isArray: "$userId" },
              "$userId",
              { $cond: [{ $eq: ["$userId", null] }, [], ["$userId"]] },
            ],
          },
        },
      },
      { $unwind: "$userIdArr" },
      { $group: { _id: "$userIdArr" } },
    ])
    .toArray();
  for (const row of loggedAgg) {
    if (row._id) loggedUserIds.add(String(row._id));
  }

  const nullWithLogs = [];
  for (const u of nullLastLoginUsers) {
    if (loggedUserIds.has(String(u._id))) nullWithLogs.push(u);
  }
  console.log(`  count: ${nullWithLogs.length}`);
  console.log("  sample (5):");
  for (const u of nullWithLogs.slice(0, 5)) {
    console.log(`    ${u._id}  ${u.email ?? "(sin email)"}`);
  }

  sub("users con lastLogin set AND 0 loginlogs (inverso — set fuera de registerLoginLog?)");
  const setLastLoginUsers = await users
    .find(
      { lastLogin: { $ne: null, $exists: true } },
      { projection: { _id: 1, email: 1, lastLogin: 1 } },
    )
    .toArray();

  const setWithoutLogs = [];
  for (const u of setLastLoginUsers) {
    if (!loggedUserIds.has(String(u._id))) setWithoutLogs.push(u);
  }
  console.log(`  count: ${setWithoutLogs.length}`);
  console.log("  sample (5):");
  for (const u of setWithoutLogs.slice(0, 5)) {
    console.log(`    ${u._id}  ${u.email ?? "(sin email)"}  lastLogin=${u.lastLogin}`);
  }

  console.log("");
  console.log("----------------------------------------");
  console.log("done — no writes performed");
  console.log("----------------------------------------");
} catch (err) {
  console.error("error:", err?.message ?? err);
  console.error(`uri attempted: ${redactedUri}`);
  console.error("if the connection failed: make sure the local Mongo from docker-compose.yml is up");
  console.error("  (docker compose up -d mongo) — this script will NOT start containers.");
  exitCode = 1;
} finally {
  await client.close();
}

process.exit(exitCode);
