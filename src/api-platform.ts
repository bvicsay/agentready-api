import { timingSafeEqual } from 'node:crypto'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code.replaceAll('_', ' '),
  ) {
    super(message)
  }
}

export function requireBearer(authorization: string | undefined): void {
  const match = /^Bearer (.+)$/i.exec(authorization ?? '')
  const expected = process.env.API_BEARER_TOKEN

  if (
    !match ||
    !expected ||
    match[1].length !== expected.length ||
    !timingSafeEqual(Buffer.from(match[1]), Buffer.from(expected))
  ) {
    throw new ApiError(401, 'bearer_key_required', 'Use Authorization: Bearer API_BEARER_TOKEN.')
  }
}

export function errorResponse(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, 'internal_error', 'The scan could not be completed.')

  return {
    status: apiError.status,
    body: { error: { code: apiError.code, message: apiError.message } },
  }
}
