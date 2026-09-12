import { PGlite } from '@electric-sql/pglite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postgres from 'postgres'
import { config } from '../config.js'

type QueryResult<Row> = {
  rows: Row[]
}

type DatabaseClient = {
  kind: 'pglite' | 'postgres'
  query<Row>(text: string, params?: unknown[]): Promise<QueryResult<Row>>
  exec(text: string): Promise<void>
  close(): Promise<void>
}

function createPgliteClient(): DatabaseClient {
  const dataDirectory = resolve(config.PGLITE_DATA_DIR)
  mkdirSync(dirname(dataDirectory), { recursive: true })
  const client = new PGlite(dataDirectory)

  return {
    kind: 'pglite',
    async query<Row>(text: string, params: unknown[] = []) {
      const result = await client.query<Row>(text, params)
      return { rows: result.rows }
    },
    async exec(text: string) {
      await client.exec(text)
    },
    async close() {
      await client.close()
    },
  }
}

function createPostgresClient(databaseUrl: string): DatabaseClient {
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    transform: { undefined: null },
  })

  return {
    kind: 'postgres',
    async query<Row>(text: string, params: unknown[] = []) {
      const rows = await client.unsafe<Row[]>(text, params as never[])
      return { rows: [...rows] }
    },
    async exec(text: string) {
      await client.unsafe(text)
    },
    async close() {
      await client.end()
    },
  }
}

export const db = config.DATABASE_URL
  ? createPostgresClient(config.DATABASE_URL)
  : createPgliteClient()
