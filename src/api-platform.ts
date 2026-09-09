import { createClerkClient, type APIKey } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code.replaceAll("_", " "),
  ) {
    super(message);
  }
}

export type ApiPrincipal = {
  keyId: string;
  subject: string;
  scopes: string[];
};

type VerifiedApiKey = Pick<APIKey, "id" | "subject" | "scopes">;
type VerifyApiKey = (secret: string) => Promise<VerifiedApiKey>;

export function createApiKeyAuthenticator(verify: VerifyApiKey) {
  return async function authenticateApiKey(
    authorization: string | undefined,
  ): Promise<ApiPrincipal> {
    const secret = bearerSecret(authorization);

    try {
      const key = await verify(secret);
      return { keyId: key.id, subject: key.subject, scopes: key.scopes };
    } catch (error) {
      if (
        error instanceof ApiError ||
        (isClerkAPIResponseError(error) && [400, 404, 422].includes(error.status))
      ) {
        throw new ApiError(
          401,
          "invalid_api_key",
          "The API key is invalid, expired, or revoked.",
        );
      }

      throw new ApiError(
        503,
        "authentication_unavailable",
        "API key validation is temporarily unavailable.",
      );
    }
  };
}

let clerkClient: ReturnType<typeof createClerkClient> | undefined;

export const authenticateApiKey = createApiKeyAuthenticator(async (secret) => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is not configured.");
  }

  clerkClient ??= createClerkClient({ secretKey });
  return clerkClient.apiKeys.verify(secret);
});

function bearerSecret(authorization: string | undefined): string {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) {
    throw new ApiError(
      401,
      "api_key_required",
      "Use Authorization: Bearer YOUR_API_KEY.",
    );
  }
  return match[1];
}

export function errorResponse(error: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          500,
          "internal_error",
          "The scan could not be completed.",
        );

  return {
    status: apiError.status,
    body: { error: { code: apiError.code, message: apiError.message } },
  };
}
