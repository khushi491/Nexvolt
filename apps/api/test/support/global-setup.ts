import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** Create the test database if needed and apply migrations. */
export default async function globalSetup(): Promise<void> {
  require('./env');
  const testUrl = process.env.DATABASE_URL!;
  const dbName = new URL(testUrl).pathname.slice(1);
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to run integration tests against non-test database "${dbName}"`);
  const adminUrl = testUrl.replace(`/${dbName}`, '/postgres');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const exists = await admin.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
  if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: testUrl } });
}
