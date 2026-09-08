import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bearer, ApiError } from './api-platform.js'
import { scan, scanInput } from './scan-service.js'

export const app = new Hono()

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  await next()
})

app.get('/healthz', c => c.json({ ok: true }))

app.post('/api/scan', async c => {
  try {
    bearer(c.req.raw)
    const length = Number(c.req.header('content-length') || 0)
    if (length > 4096) throw new ApiError(413, 'request_too_large')
    const body = await c.req.json()
    const result = await scan(scanInput(body))
    return c.json(result)
  } catch (error) {
    const e = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'The scan could not be completed.')
    if (e.status === 401) c.header('WWW-Authenticate', 'Bearer realm="AgentReady API"')
    return c.json({ error: { code: e.code, message: e.message } }, e.status as 400)
  }
})

app.all('*', c => c.json({ error: { code: 'not_found', message: 'Route not found.' } }, 404))

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000), hostname: '0.0.0.0' }, info => {
    console.log(`AgentReady API listening on ${info.address}:${info.port}`)
  })
}
