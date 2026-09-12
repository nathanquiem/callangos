import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { db } from './client.js'

export async function migrate() {
  const migrationsUrl = new URL('../../migrations/', import.meta.url)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  const files = (await readdir(migrationsUrl))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const applied = await db.query('SELECT name FROM schema_migrations WHERE name = $1', [file])
    if (applied.rows[0]) continue

    const sql = await readFile(new URL(file, migrationsUrl), 'utf8')
    await db.exec(sql)
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate()
  console.log(`Database migrated using ${db.kind}.`)
  await db.close()
}
