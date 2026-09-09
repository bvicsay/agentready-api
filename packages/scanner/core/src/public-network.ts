import dns from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, fetch, type RequestInit, type Response } from "undici";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export function validatePublicUrl(value: string | URL): URL {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const unsupportedHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (!hostname.includes(".") && !ipaddr.isValid(hostname));

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    unsupportedHostname ||
    (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
  ) {
    throw new Error("Only public HTTP(S) URLs on standard ports can be scanned.");
  }

  return url;
}

const publicDispatcher = new Agent({
  connect: {
    lookup(hostname: string, options: dns.LookupAllOptions, callback: (...args: unknown[]) => void): void {
      dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
          return callback(new Error("Private or reserved DNS destination blocked."));
        }
        if (options.all) return callback(null, addresses);
        const first = addresses[0]!;
        return callback(null, first.address, first.family);
      });
    }
  } as never
});

export async function fetchPublicUrl(
  value: string | URL,
  options: RequestInit,
  allowedOrigins: Set<string>,
  allowRedirectOrigins: boolean
): Promise<Response> {
  let url = validatePublicUrl(value);

  for (let redirect = 0; redirect <= 4; redirect += 1) {
    if (!allowedOrigins.has(url.origin)) {
      throw new Error("Cross-site scan request blocked.");
    }

    options.signal?.throwIfAborted();
    const response = await fetch(url, {
      ...options,
      dispatcher: publicDispatcher,
      redirect: "manual"
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || redirect === 4) throw new Error("Invalid or excessive redirects.");

    const redirected = validatePublicUrl(new URL(location, url));
    if (redirected.origin !== url.origin) {
      if (!allowRedirectOrigins) throw new Error("Cross-site scan redirect blocked.");
      allowedOrigins.add(redirected.origin);
    }
    url = redirected;
  }

  throw new Error("Invalid or excessive redirects.");
}
