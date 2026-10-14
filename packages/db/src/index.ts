// Prisma client for the SIEAmB database. Runtime connections go through the
// pg driver adapter (Prisma 7 has no built-in engine) using DATABASE_URL, the
// transaction-mode pooler. Migrations use DIRECT_URL via prisma.config.ts.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';

export interface CreatePrismaClientOptions {
  connectionString?: string;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString, ssl: { rejectUnauthorized: false } });
  return new PrismaClient({ adapter });
}
