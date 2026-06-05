/**
 * One-off: corrige o índice da coleção `favourites`.
 *
 * Problema: existia um índice unique órfão `order_1` (global) que causava
 * E11000 ao favoritar quando o `order` já existia em qualquer documento.
 * A entity NÃO o declara mais — Mongoose nunca dropa índices sozinho.
 *
 * Este script: dropa `order_1` (se existir) e garante o índice correto
 * { userID: 1, reportIdPB: 1 } unique.
 *
 * Uso (a partir de app/):  npx ts-node scripts/fix-favourites-index.ts
 * Lê a conexão de MONGO_DSN no seu .env (mesma que a app usa).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGO_DSN;
  if (!uri) {
    console.error('✗ MONGO_DSN não definido no ambiente (.env). Abortando.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const col = mongoose.connection.collection('favourites');

  const before = await col.indexes();
  console.log('Índices atuais:', before.map((i) => i.name).join(', '));

  if (before.some((i) => i.name === 'order_1')) {
    await col.dropIndex('order_1');
    console.log('✓ Índice órfão `order_1` removido.');
  } else {
    console.log('• `order_1` não existe (nada a remover).');
  }

  await col.createIndex({ userID: 1, reportIdPB: 1 }, { unique: true });
  console.log('✓ Índice { userID, reportIdPB } unique garantido.');

  const after = await col.indexes();
  console.log('Índices finais:', after.map((i) => i.name).join(', '));

  await mongoose.disconnect();
  console.log('Pronto.');
}

main().catch((err) => {
  console.error('✗ Erro:', err.message);
  process.exit(1);
});
