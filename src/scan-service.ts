import { ApiError } from './api-platform.js'
import { runScan } from '../packages/scanner/core/src/scanner.js'
import { TargetUnavailableError } from '../packages/scanner/core/src/scanner-errors.js'
import { validatePublicUrl } from '../packages/scanner/core/src/public-network.js'
import { builtInRules } from '../packages/scanner/rules/src/builtins.js'
import { profiles as scannerProfiles, type ProfileOption } from '../packages/scanner/types/src/index.js'

export const profiles = ['auto', ...scannerProfiles] as const

export type ScanInput = {
  target: URL
  profile: ProfileOption
}

type ScanRequest = {
  url?: unknown
  profile?: unknown
}

export function scanInput(body: ScanRequest): ScanInput {
  if (typeof body.url !== 'string' || !body.url.trim() || body.url.length > 2048) {
    throw new ApiError(400, 'invalid_url', 'Enter a public website URL.')
  }

  let target: URL
  try {
    const value = /^[a-z][a-z\d+.-]*:/i.test(body.url.trim()) ? body.url.trim() : `https://${body.url.trim()}`
    target = validatePublicUrl(value)
  } catch {
    throw new ApiError(400, 'invalid_url', 'Only public HTTP(S) URLs on standard ports are supported.')
  }

  if (target.search || target.hash) {
    throw new ApiError(400, 'url_parameters_not_supported', 'Remove query parameters and fragments. Do not submit private or token-bearing URLs.')
  }

  if (
    (target.hostname === 'adaptmypage.com' || target.hostname === 'www.adaptmypage.com') &&
    target.pathname.startsWith('/api/')
  ) {
    throw new ApiError(400, 'recursive_scan_blocked')
  }

  const profile = body.profile ?? 'auto'
  if (typeof profile !== 'string' || !profiles.includes(profile as ProfileOption)) {
    throw new ApiError(400, 'invalid_profile')
  }

  return { target, profile: profile as ProfileOption }
}

export async function scan(input: ScanInput): Promise<unknown> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const pending = runScan({
      target: input.target.href,
      profile: input.profile,
      maxPages: 12,
      maxRequests: 50,
      timeoutMs: 4_000,
      rateLimit: { requestsPerSecond: 3 },
      respectRobots: true,
      active: false,
      browser: false,
      signal: controller.signal,
      publicOnly: true,
      requireSuccessfulTarget: true,
    }, builtInRules)
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new ApiError(504, 'scan_timeout', 'Scan exceeded 45 seconds. Try again later.'))
      }, 45_000)
    })
    return await Promise.race([pending, deadline])
  } catch (error) {
    if (error instanceof TargetUnavailableError) {
      throw new ApiError(422, 'target_unavailable', 'The public website could not be fetched. It may be blocked, unavailable, or exceed scan limits.')
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    controller.abort()
  }
}

// Conservative estimated infrastructure cost in micro-USD, not a billing promise.
export function scanCost(cpu: NodeJS.CpuUsage, wallMs: number, failed: boolean): number {
  if (failed) return 5_000

  const cpuHours = (cpu.user + cpu.system) / 1e6 / 3_600
  const memoryHours = (2 * wallMs) / 1_000 / 3_600
  return Math.min(5_000, Math.max(100, Math.ceil((cpuHours * 0.184 + memoryHours * 0.0152 + 0.00001) * 1.3e6)))
}
