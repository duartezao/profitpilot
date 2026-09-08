/**
 * Script para trocar password de um utilizador
 * 
 * Uso: node scripts/reset-password.mjs <email_ou_username> <nova_password>
 * Exemplo: node scripts/reset-password.mjs joao@email.com minhaNovaPassword123
 */

import { hash } from "@node-rs/argon2";
import mongoose from "mongoose";
import "dotenv/config";

const [,, identifier, newPassword] = process.argv;

if (!identifier || !newPassword) {
  console.error("Uso: node scripts/reset-password.mjs <email_ou_username> <nova_password>");
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error("A password deve ter pelo menos 8 caracteres.");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI não configurado no .env");
  process.exit(1);
}

async function resetPassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Conectado ao MongoDB");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Procura por email ou username
    const user = await usersCollection.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
      ],
    });

    if (!user) {
      console.error(`Utilizador "${identifier}" não encontrado.`);
      process.exit(1);
    }

    console.log(`Utilizador encontrado: ${user.name} (${user.email || user.username})`);

    // Gera novo hash com Argon2
    const newHash = await hash(newPassword);

    // Actualiza na BD
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { passwordHash: newHash, updatedAt: new Date() } }
    );

    console.log("✅ Password actualizada com sucesso!");
    
  } catch (error) {
    console.error("Erro:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

resetPassword();
