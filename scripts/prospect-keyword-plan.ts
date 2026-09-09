import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

type KeywordRow = {
  country: string
  sector: string
  buyer_signal: string
  query: string
  notes: string
}

type SearchPlanRow = KeywordRow & {
  search_query: string
  review_goal: string
  seed_csv_instruction: string
}

const requiredHeaders = ['country', 'sector', 'buyer_signal', 'query', 'notes'] as const

function usage(): never {
  console.error([
    'Usage: npm run prospect-keywords -- --input data/prospect-keywords.csv --output data/prospect-search-plan.csv',
    '',
    'This creates a compliant company-discovery search plan. It does not scrape Google result pages or harvest emails.',
  ].join('\n'))
  process.exit(1)
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (quoted && char === '"' && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (!quoted && char === ',') {
      row.push(cell)
      cell = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      if (row.some(value => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  if (rows.length === 0) return []

  const headers = rows[0].map(value => value.trim())
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) throw new Error(`Missing required column: ${header}`)
  }

  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows: SearchPlanRow[]): string {
  const headers = [
    'country',
    'sector',
    'buyer_signal',
    'query',
    'search_query',
    'review_goal',
    'seed_csv_instruction',
    'notes',
  ] satisfies Array<keyof SearchPlanRow>

  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n') + '\n'
}

function normalizeRow(row: Record<string, string>): KeywordRow | null {
  const country = row.country?.trim()
  const sector = row.sector?.trim()
  const buyerSignal = row.buyer_signal?.trim()
  const query = row.query?.trim()
  if (!country || !sector || !buyerSignal || !query) return null

  return {
    country,
    sector,
    buyer_signal: buyerSignal,
    query,
    notes: row.notes?.trim() ?? '',
  }
}

function buildSearchQuery(row: KeywordRow): string {
  return [
    row.query,
    row.country,
    '-jobs',
    '-career',
    '-linkedin',
    '-facebook',
    '-instagram',
    '-privacy',
    '-terms',
  ].join(' ')
}

function expand(row: KeywordRow): SearchPlanRow {
  return {
    ...row,
    search_query: buildSearchQuery(row),
    review_goal: `Find official company websites in ${row.country} where ${row.buyer_signal.toLowerCase()} indicates the website is part of the customer journey.`,
    seed_csv_instruction: `Add reviewed official sites to data/prospect-seeds.csv with sector "${row.sector}" and source "${row.query}".`,
  }
}

async function main(): Promise<void> {
  const input = arg('--input')
  const output = arg('--output')
  if (!input || !output) usage()

  const rows = parseCsv(await readFile(input, 'utf8'))
    .map(normalizeRow)
    .filter((row): row is KeywordRow => Boolean(row))
    .map(expand)

  await writeFile(output, toCsv(rows), 'utf8')
  console.error(`Wrote ${rows.length} compliant search-plan rows to ${output}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
