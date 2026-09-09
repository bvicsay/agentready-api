import { AsyncLocalStorage } from 'node:async_hooks'
import dns from 'node:dns'
import ipaddr from 'ipaddr.js'
import { Agent, fetch as request } from 'undici'

type ScanContext = {
  signal: AbortSignal
  requests: number
  rootError: string | null
  origins?: Set<string>
}

type FetchOptions = Parameters<typeof request>[1]

export const scanContext = new AsyncLocalStorage<ScanContext>()

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast'
  } catch {
    return false
  }
}

export function validateUrl(value: string | URL): URL {
  const url = new URL(value)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const unsupportedAddress = hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    (!hostname.includes('.') && !ipaddr.isValid(hostname))

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    unsupportedAddress ||
    (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
  ) {
    throw new Error('Only public HTTP(S) URLs on standard ports can be scanned.')
  }

  return url
}

const dispatcher = new Agent({
  connect: {
    // Validate the actual DNS results used by the socket, not a separate preflight.
    lookup(hostname: string, options: dns.LookupAllOptions, callback: (...args: unknown[]) => void): void {
      dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (error) return callback(error)
        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
          return callback(new Error('Private or reserved DNS destination blocked.'))
        }
        if (options.all) return callback(null, addresses)
        const first = addresses[0]
        return callback(null, first.address, first.family)
      })
    },
  } as never,
})

export async function fetch(value: string | URL, options: FetchOptions = {}) {
  const context = scanContext.getStore()
  const isRootRequest = context ? context.requests++ === 0 : false

  try {
    let url = validateUrl(value)
    if (context?.rootError) throw new Error(context.rootError)
    if (isRootRequest && context) context.origins = new Set([url.origin])
    if (context?.origins && !context.origins.has(url.origin)) {
      throw new Error('Cross-site scan requests are not allowed.')
    }

    const signal = context
      ? AbortSignal.any([context.signal, options.signal].filter((item): item is AbortSignal => Boolean(item)))
      : options.signal

    for (let redirect = 0; redirect <= 4; redirect += 1) {
      signal?.throwIfAborted()
      const response = await request(url, { ...options, signal, redirect: 'manual', dispatcher })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        if (!location || redirect === 4) throw new Error('Invalid or excessive redirects.')

        url = validateUrl(new URL(location, url))
        if (isRootRequest) context?.origins?.add(url.origin)
        else if (context?.origins && !context.origins.has(url.origin)) {
          throw new Error('Cross-site scan redirect blocked.')
        }
        continue
      }

      if (isRootRequest && !response.ok) {
        context!.rootError = `The website returned HTTP ${response.status}.`
      }

      const chunks: Buffer[] = []
      let size = 0
      if (response.body) {
        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            size += value.byteLength
            if (size > 750_000) {
              await reader.cancel()
              throw new Error('Response exceeds the scan size limit.')
            }
            chunks.push(Buffer.from(value))
          }
        } finally {
          reader.releaseLock()
        }
      }
      const body = Buffer.concat(chunks)

      return {
        url: url.href,
        redirected: redirect > 0,
        headers: response.headers,
        status: response.status,
        ok: response.ok,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      }
    }

    throw new Error('Invalid or excessive redirects.')
  } catch (error) {
    if (isRootRequest && context) {
      context.rootError = error instanceof Error ? error.message : 'The website could not be fetched.'
    }
    throw error
  }
}
