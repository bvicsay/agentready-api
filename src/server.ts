import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { ApiError, errorResponse, requireBearer } from './api-platform.js'
import { scan, scanInput } from './scan-service.js'

export const app = new Hono()
const reportRequests = new Map<string, { count: number; resetAt: number }>()

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character))
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const reportEmailHtml = (host: string, report: Record<string, unknown>) => {
  const findings = Array.isArray(report.findings) ? report.findings.map(object) : []
  const rows = findings.map(finding => `<tr><td style="padding:10px;border-bottom:1px solid #d8ddd6;color:${finding.status === 'fail' ? '#b42318' : '#172019'};font-weight:700">${escapeHtml(finding.status)}</td><td style="padding:10px;border-bottom:1px solid #d8ddd6">${escapeHtml(finding.title)}</td><td style="padding:10px;border-bottom:1px solid #d8ddd6">${escapeHtml(finding.recommendation || '—')}</td></tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f1f0eb;color:#172019;font-family:Arial,sans-serif"><main style="max-width:720px;margin:0 auto;padding:32px"><p style="font:11px monospace;letter-spacing:.08em">ADAPT MY PAGE · DETAILED REPORT</p><h1 style="font-size:34px;margin:14px 0 8px">${escapeHtml(host)}</h1><p style="font-size:18px;margin:0 0 28px">Agent readiness score: <strong>${escapeHtml(report.score)}/100</strong></p><table style="width:100%;border-collapse:collapse;background:#fff;font-size:14px"><thead><tr><th style="padding:10px;text-align:left;background:#d6ff4f">Status</th><th style="padding:10px;text-align:left;background:#d6ff4f">Finding</th><th style="padding:10px;text-align:left;background:#d6ff4f">Recommended fix</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`
}

function allowReportRequest(ip: string): void {
  const now = Date.now()
  const existing = reportRequests.get(ip)
  if (!existing || existing.resetAt <= now) {
    reportRequests.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return
  }
  if (existing.count >= 3) throw new ApiError(429, 'report_email_limit', 'You can request up to three reports per hour.')
  existing.count += 1
}

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  await next()
})

app.get('/healthz', c => c.json({ ok: true }))

app.post('/api/scan', async c => {
  try {
    requireBearer(c.req.header('authorization'))
    const length = Number(c.req.header('content-length') || 0)
    if (length > 4096) throw new ApiError(413, 'request_too_large')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'invalid_request', 'Request body must be a JSON object.')
    }
    const result = await scan(scanInput(body))
    return c.json(result)
  } catch (error) {
    const { status, body } = errorResponse(error)
    if (status === 401) c.header('WWW-Authenticate', 'Bearer realm="AgentReady API"')
    return c.json(body, status as 400)
  }
})

app.post('/api/report-email', async c => {
  try {
    requireBearer(c.req.header('authorization'))
    allowReportRequest(c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown')
    const length = Number(c.req.header('content-length') || 0)
    if (length > 250_000) throw new ApiError(413, 'request_too_large')
    const body = object(await c.req.json())
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const host = typeof body.host === 'string' ? body.host.trim() : ''
    const report = object(body.report)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !host || !Array.isArray(report.findings)) {
      throw new ApiError(400, 'invalid_request', 'Enter a valid email address and complete a scan first.')
    }
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.REPORT_FROM_EMAIL
    if (!apiKey || !from) throw new ApiError(503, 'report_email_unavailable', 'Report email is not configured yet.')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `Your Agent-Ready report for ${host}`, html: reportEmailHtml(host, report) }),
    })
    if (!response.ok) throw new ApiError(502, 'report_email_failed', 'We could not send the report. Please try again later.')
    return c.json({ ok: true })
  } catch (error) {
    const { status, body } = errorResponse(error)
    if (status === 401) c.header('WWW-Authenticate', 'Bearer realm="AgentReady API"')
    return c.json(body, status as 400)
  }
})

app.all('*', c => c.json({ error: { code: 'not_found', message: 'Route not found.' } }, 404))

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000), hostname: '0.0.0.0' }, info => {
    console.log(`AgentReady API listening on ${info.address}:${info.port}`)
  })
}
