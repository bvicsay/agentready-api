import { ApiError, errorResponse, requireBearer } from './api-platform.js'
import { scan, scanInput } from './scan-service.js'

type Request = {
  body: unknown
  headers?: { authorization?: string }
  method?: string
}

type Response = {
  json(value: unknown): Response
  setHeader(name: string, value: string): void
  status(code: number): Response
}

export function createHandler({ present = (result: unknown) => result } = {}) {
  return async (req: Request, res: Response): Promise<Response> => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    try {
      if (req.method !== 'POST') throw new ApiError(405, 'method_not_allowed', 'Use POST with a JSON body.')
      requireBearer(req.headers?.authorization)
      return res.status(200).json(present(await scan(scanInput(req.body as Record<string, unknown>))))
    } catch (error) {
      const { status, body } = errorResponse(error)
      return res.status(status).json(body)
    }
  }
}
