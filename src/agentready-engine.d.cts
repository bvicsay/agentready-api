export const builtInRules: readonly unknown[]

export function runScan(options: Record<string, unknown>, rules: readonly unknown[]): Promise<unknown>

export const scanContext: import('node:async_hooks').AsyncLocalStorage<{
  signal: AbortSignal
  requests: number
  rootError: string | null
  origins?: Set<string>
}>

export function validateUrl(value: string | URL): URL
