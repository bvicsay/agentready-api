import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { Agent, fetch as undiciFetch } from 'undici'
import { builtInRules, runScan, scanContext, validateUrl } from '../src/agentready-engine.cjs'

type Seed = {
  company: string
  website: string
  country?: string
  sector?: string
  source?: string
  notes?: string
}

type ContactSignal = {
  emails: string[]
  phones: string[]
  pages: string[]
}

type ScanResult = {
  score?: number
  findings?: Array<{
    id?: string
    title?: string
    status?: string
    severity?: string
    recommendation?: string
  }>
}

type ProspectRow = {
  company: string
  website: string
  country: string
  sector: string
  fit_score: number
  agentready_score: string
  critical_findings: string
  major_findings: string
  public_role_emails: string
  public_phone_numbers: string
  contact_pages: string
  ai_readiness_angles: string
  targeting_notes: string
  draft_email: string
  source: string
}

const rolePrefixes = [
  'info',
  'contact',
  'hello',
  'sales',
  'support',
  'service',
  'customerservice',
  'customer.service',
  'office',
  'booking',
  'bookings',
  'reservation',
  'reservations',
  'commercial',
  'export',
  'webshop',
  'shop',
  'orders',
  'enquiries',
  'inquiries',
  'kontakt',
  'kundeservice',
  'clientservice',
  'reception',
  'partners',
  'partnerships',
]

const blockedEmailParts = [
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'privacy',
  'datenschutz',
  'dpo',
  'abuse',
  'postmaster',
  'webmaster',
]

const contactPathHints = [
  'contact',
  'kontakt',
  'about',
  'impressum',
  'imprint',
  'support',
  'customer',
  'service',
  'sales',
  'booking',
  'reservation',
  'enquiry',
  'inquiry',
]

const contactDispatcher = new Agent({
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 1_000,
})

function usage(): never {
  console.error([
    'Usage: npm run prospects -- --input data/prospect-seeds.csv --output data/prospects.csv',
    '',
    'Options:',
    '  --input <path>       CSV with company,website,country,sector,source,notes columns',
    '  --output <path>      Output CSV path',
    '  --limit <number>     Maximum seed rows to process',
    '  --delay-ms <number>  Delay between websites, default 750',
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
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows: ProspectRow[]): string {
  const headers = [
    'company',
    'website',
    'country',
    'sector',
    'fit_score',
    'agentready_score',
    'critical_findings',
    'major_findings',
    'public_role_emails',
    'public_phone_numbers',
    'contact_pages',
    'ai_readiness_angles',
    'targeting_notes',
    'draft_email',
    'source',
  ] satisfies Array<keyof ProspectRow>

  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n') + '\n'
}

function normalizeSeed(row: Record<string, string>): Seed | null {
  const company = row.company?.trim()
  const website = row.website?.trim()
  if (!company || !website) return null
  return {
    company,
    website,
    country: row.country?.trim(),
    sector: row.sector?.trim(),
    source: row.source?.trim(),
    notes: row.notes?.trim(),
  }
}

function normalizeUrl(value: string): URL {
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
  const url = validateUrl(candidate)
  url.hash = ''
  url.search = ''
  return url
}

async function fetchText(url: URL, signal: AbortSignal): Promise<string | null> {
  const response = await undiciFetch(url, {
    signal,
    dispatcher: contactDispatcher,
    headers: {
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      'user-agent': 'AgentReadyProspectingAudit/0.1 (+https://adaptmypage.com)',
    },
    redirect: 'follow',
  })

  if (!response.ok) return null
  const contentType = response.headers.get('content-type') ?? ''
  if (!/text|html|xhtml/i.test(contentType)) return null
  const text = await response.text()
  return text.slice(0, 750_000)
}

function sameOriginUrl(href: string, base: URL): URL | null {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null
  try {
    const url = new URL(href, base)
    if (url.origin !== base.origin) return null
    url.hash = ''
    url.search = ''
    return validateUrl(url)
  } catch {
    return null
  }
}

function discoverContactPages(html: string, base: URL): URL[] {
  const $ = cheerio.load(html)
  const pages = new Map<string, URL>()

  for (const element of $('a[href]').toArray()) {
    const href = $(element).attr('href') ?? ''
    const label = `${href} ${$(element).text()}`.toLowerCase()
    if (!contactPathHints.some(hint => label.includes(hint))) continue
    const url = sameOriginUrl(href, base)
    if (url) pages.set(url.href, url)
    if (pages.size >= 8) break
  }

  for (const path of ['/contact', '/kontakt', '/impressum', '/imprint']) {
    if (pages.size >= 8) break
    const url = sameOriginUrl(path, base)
    if (url) pages.set(url.href, url)
  }

  return [...pages.values()]
}

function isRoleEmail(email: string): boolean {
  const [local = '', domain = ''] = email.toLowerCase().split('@')
  if (!local || !domain || blockedEmailParts.some(part => local.includes(part))) return false
  if (/\d/.test(local)) return false
  return rolePrefixes.some(prefix => local === prefix || local.startsWith(`${prefix}.`) || local.startsWith(`${prefix}-`))
}

function extractEmails(text: string): string[] {
  const decoded = text
    .replace(/%40/gi, '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')

  const matches = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []
  return [...new Set(matches.map(email => email.toLowerCase()).filter(isRoleEmail))].sort()
}

function extractPhones(html: string): string[] {
  const $ = cheerio.load(html)
  const phones = new Set<string>()

  for (const element of $('a[href^="tel:"]').toArray()) {
    const value = ($(element).attr('href') ?? '').replace(/^tel:/i, '').trim()
    if (value) phones.add(value)
  }

  return [...phones].sort()
}

async function collectContacts(seed: Seed, root: URL): Promise<ContactSignal> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)

  try {
    const homepage = await fetchText(root, controller.signal)
    if (!homepage) return { emails: [], phones: [], pages: [] }

    const pages = [root, ...discoverContactPages(homepage, root)]
    const emails = new Set<string>(extractEmails(homepage))
    const phones = new Set<string>(extractPhones(homepage))
    const visited = new Set<string>([root.href])

    for (const page of pages.slice(1, 7)) {
      if (visited.has(page.href)) continue
      visited.add(page.href)
      const html = await fetchText(page, controller.signal)
      if (!html) continue
      for (const email of extractEmails(html)) emails.add(email)
      for (const phone of extractPhones(html)) phones.add(phone)
    }

    return {
      emails: [...emails].sort(),
      phones: [...phones].sort().slice(0, 5),
      pages: [...visited].sort(),
    }
  } catch (error) {
    console.warn(`Contact collection failed for ${seed.company}: ${error instanceof Error ? error.message : String(error)}`)
    return { emails: [], phones: [], pages: [] }
  } finally {
    clearTimeout(timeout)
  }
}

async function auditWebsite(root: URL): Promise<ScanResult | null> {
  const controller = new AbortController()
  const context = { signal: controller.signal, requests: 0, rootError: null as string | null }
  const timeout = setTimeout(() => controller.abort(), 50_000)

  try {
    const result = await scanContext.run(context, () => runScan({
      target: root.href,
      profile: 'website',
      maxPages: 10,
      maxRequests: 35,
      timeoutMs: 4_000,
      rateLimit: { requestsPerSecond: 2 },
      respectRobots: true,
      active: false,
      browser: false,
    }, builtInRules))

    return result as ScanResult
  } catch (error) {
    console.warn(`AgentReady scan failed for ${root.href}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

function topFindings(scan: ScanResult | null, severity: string): string[] {
  return (scan?.findings ?? [])
    .filter(finding => ['fail', 'warn'].includes(finding.status ?? '') && finding.severity === severity)
    .filter(finding => !finding.title?.toLowerCase().includes('not obviously unsafe'))
    .slice(0, 4)
    .map(finding => `${finding.status}: ${finding.title ?? finding.id ?? 'Readiness issue'}`)
}

function topRecommendations(scan: ScanResult | null): string[] {
  return (scan?.findings ?? [])
    .filter(finding => ['fail', 'warn'].includes(finding.status ?? ''))
    .filter(finding => !finding.title?.toLowerCase().includes('not obviously unsafe'))
    .filter(finding => finding.recommendation)
    .slice(0, 4)
    .map(finding => finding.recommendation as string)
}

function readinessAngles(scan: ScanResult | null, contacts: ContactSignal): string[] {
  const findings = (scan?.findings ?? []).filter(finding => finding.status !== 'pass')
  const angles = new Set<string>()

  if (findings.some(finding => finding.id?.includes('robots') || finding.title?.toLowerCase().includes('robots'))) {
    angles.add('crawler policy clarity')
  }
  if (findings.some(finding => finding.id?.includes('structured') || finding.title?.toLowerCase().includes('structured'))) {
    angles.add('structured data for agent understanding')
  }
  if (findings.some(finding => finding.id?.includes('sitemap') || finding.title?.toLowerCase().includes('sitemap'))) {
    angles.add('discoverability through sitemaps')
  }
  if (findings.some(finding => finding.id?.includes('agent') || finding.title?.toLowerCase().includes('agent'))) {
    angles.add('agent-facing policy and discovery endpoints')
  }
  if (contacts.emails.length === 0) {
    angles.add('hard-to-detect public contact channel')
  }
  if (angles.size === 0) {
    angles.add('baseline AI-agent accessibility review')
  }

  return [...angles]
}

function fitScore(seed: Seed, scan: ScanResult | null, contacts: ContactSignal): number {
  let score = 40
  const sector = `${seed.sector ?? ''} ${seed.notes ?? ''}`.toLowerCase()

  if (/(commerce|retail|shop|tourism|travel|hotel|booking|ticket|marketplace|directory|catalog|wholesale|manufactur)/.test(sector)) score += 20
  if (scan?.score !== undefined && scan.score < 80) score += 20
  if (scan?.score !== undefined && scan.score < 60) score += 10
  if (topFindings(scan, 'critical').length > 0) score += 10
  if (contacts.emails.length > 0) score += 5

  return Math.max(0, Math.min(100, score))
}

function draftEmail(seed: Seed, root: URL, scan: ScanResult | null, contacts: ContactSignal): string {
  const angles = readinessAngles(scan, contacts)
  const issues = topRecommendations(scan).slice(0, 3)
  const issueText = issues.length > 0
    ? `I noticed a few likely AI-agent readiness gaps on ${root.hostname}: ${issues.join(' ')}`
    : `I ran a passive check of ${root.hostname} for signals that help AI agents understand and navigate the site.`

  return [
    `Subject: Quick AI-agent readiness check for ${seed.company}`,
    '',
    `Hi ${seed.company} team,`,
    '',
    `${issueText} These matter as more customers ask AI assistants to compare providers, find product details, check availability, or identify the right contact route.`,
    '',
    `The most relevant angles for your site look like ${angles.join(', ')}. I built AgentReady to show these issues in a short, practical report without logins or invasive testing.`,
    '',
    `Would it be useful if I sent over the readout for ${root.hostname}?`,
    '',
    'Best,',
  ].join('\n')
}

async function processSeed(seed: Seed): Promise<ProspectRow> {
  const root = normalizeUrl(seed.website)
  const [contacts, scan] = await Promise.all([
    collectContacts(seed, root),
    auditWebsite(root),
  ])

  const critical = topFindings(scan, 'critical')
  const major = topFindings(scan, 'major')
  const angles = readinessAngles(scan, contacts)

  return {
    company: seed.company,
    website: root.href,
    country: seed.country ?? '',
    sector: seed.sector ?? '',
    fit_score: fitScore(seed, scan, contacts),
    agentready_score: scan?.score?.toString() ?? '',
    critical_findings: critical.join(' | '),
    major_findings: major.join(' | '),
    public_role_emails: contacts.emails.join('; '),
    public_phone_numbers: contacts.phones.join('; '),
    contact_pages: contacts.pages.join('; '),
    ai_readiness_angles: angles.join('; '),
    targeting_notes: seed.notes ?? '',
    draft_email: draftEmail(seed, root, scan, contacts),
    source: seed.source ?? root.href,
  }
}

async function main(): Promise<void> {
  const input = arg('--input')
  const output = arg('--output')
  const limit = Number(arg('--limit') ?? Number.POSITIVE_INFINITY)
  const delayMs = Number(arg('--delay-ms') ?? 750)

  if (!input || !output) usage()

  const rows = parseCsv(await readFile(input, 'utf8'))
  const seeds = rows.map(normalizeSeed).filter((seed): seed is Seed => Boolean(seed)).slice(0, limit)
  const prospects: ProspectRow[] = []

  for (const [index, seed] of seeds.entries()) {
    console.error(`[${index + 1}/${seeds.length}] ${seed.company} ${seed.website}`)
    try {
      prospects.push(await processSeed(seed))
    } catch (error) {
      console.warn(`Skipped ${seed.company}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (index + 1 < seeds.length && delayMs > 0) await delay(delayMs)
  }

  await writeFile(output, toCsv(prospects), 'utf8')
  console.error(`Wrote ${prospects.length} prospects to ${output}`)
  await contactDispatcher.close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error)
    contactDispatcher.close().finally(() => process.exit(1))
  })
}
