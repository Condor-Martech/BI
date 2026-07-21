#!/usr/bin/env node
// Reset password de un usuario sin enviar email.
// Replica users.service.ts:updatePass — misma lib (bcryptjs), mismo costo, misma password gen.
// Uso:
//   node app/scripts/reset-password.mjs <email> [--length N] [--uri mongodb://...]
// Env:
//   MONGO_DSN    (default: mongodb://localhost:27017/app)
//   BCRYPT_COST  (default: 10)

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!email) {
  console.error("uso: node app/scripts/reset-password.mjs <email> [--length N] [--uri mongodb://...]");
  process.exit(1);
}

const uri = getFlag("uri") ?? process.env.MONGO_DSN ?? "mongodb://localhost:27017/app";
const length = Number(getFlag("length") ?? 8);
const cost = Number(process.env.BCRYPT_COST ?? 10);

function generatePassword(len) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db();
  const users = db.collection("users");

  const user = await users.findOne({ email }, { projection: { _id: 1, email: 1, name: 1 } });
  if (!user) {
    console.error(`user not found: ${email}`);
    process.exit(2);
  }

  const pass = generatePassword(length);
  const salt = await bcrypt.genSalt(cost);
  const hash = await bcrypt.hash(pass, salt);

  await users.updateOne(
    { _id: user._id },
    { $set: { password: hash, lastModified: new Date() } },
  );

  console.log("----------------------------------------");
  console.log(`email:    ${user.email}`);
  console.log(`name:     ${user.name ?? "(sin nombre)"}`);
  console.log(`user_id:  ${user._id}`);
  console.log(`password: ${pass}`);
  console.log("----------------------------------------");
} finally {
  await client.close();
}
