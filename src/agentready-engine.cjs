"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/agentready-entry.ts
var agentready_entry_exports = {};
__export(agentready_entry_exports, {
  builtInRules: () => builtInRules,
  isPublicAddress: () => isPublicAddress,
  runScan: () => runScan,
  scanContext: () => scanContext,
  validateUrl: () => validateUrl
});
module.exports = __toCommonJS(agentready_entry_exports);

// packages/types/src/index.ts
var agentReadyVersion = "0.1.0-alpha.0";
var profiles = [
  "website",
  "merchant",
  "api",
  "marketplace",
  "mcp-server",
  "agent-service"
];

// packages/core/src/options.ts
function normalizeOptions(options) {
  return {
    target: options.target,
    profile: options.profile ?? "auto",
    format: options.format ?? "text",
    maxPages: clampInteger(options.maxPages ?? 24, 1, 200),
    maxRequests: clampInteger(options.maxRequests ?? 80, 1, 500),
    timeoutMs: clampInteger(options.timeoutMs ?? 1e4, 1e3, 12e4),
    rateLimit: {
      requestsPerSecond: clampNumber(options.rateLimit?.requestsPerSecond ?? 2, 0.1, 20)
    },
    respectRobots: options.respectRobots ?? true,
    active: options.active ?? false,
    browser: options.browser ?? false,
    failOn: options.failOn ?? "none",
    include: options.include ?? [],
    exclude: options.exclude ?? []
  };
}
function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// packages/core/src/html.ts
var cheerio = __toESM(require("cheerio"), 1);

// packages/core/src/utils.ts
var SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /xox[baprs]-[A-Za-z0-9-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];
function normalizeTarget(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Target URL is required.");
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https targets are supported.");
  }
  url.hash = "";
  return url;
}
function pathKey(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}
function sameOrigin(base, candidate) {
  try {
    return new URL(base).origin === new URL(candidate, base).origin;
  } catch {
    return false;
  }
}
function resolveSameOrigin(base, candidate) {
  try {
    const resolved = new URL(candidate, base);
    if (!["http:", "https:"].includes(resolved.protocol)) return void 0;
    if (!sameOrigin(base, resolved.href)) return void 0;
    resolved.hash = "";
    return resolved.href;
  } catch {
    return void 0;
  }
}
function rootPath(origin, path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, origin).href;
}
function unique(items) {
  return [...new Set(items)];
}
function truncate(value, max = 240) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1)}\u2026`;
}
function redactSecrets(value) {
  return SECRET_PATTERNS.reduce((text2, pattern) => text2.replace(pattern, "[REDACTED]"), value);
}
function evidence(message, url, data) {
  return {
    message: redactSecrets(truncate(message, 500)),
    ...url ? { url } : {},
    ...data === void 0 ? {} : { data }
  };
}
function bodyText(records) {
  return records.map((record2) => record2.body).join("\n").toLowerCase();
}
function hasAny(text2, needles) {
  const haystack = text2.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}
function statusLabel(record2) {
  if (!record2) return "not fetched";
  if (record2.error) return `error: ${record2.error}`;
  return `HTTP ${record2.status}`;
}
function header(record2, name) {
  if (!record2) return void 0;
  return record2.headers[name.toLowerCase()];
}
function successful(record2) {
  return Boolean(record2 && record2.status >= 200 && record2.status < 300 && !record2.error);
}

// packages/core/src/html.ts
function parseHtmlPage(url, html) {
  const $ = cheerio.load(html);
  const jsonLd = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
    }
  });
  $("script,style,noscript,svg").remove();
  const anchors = [];
  const links = [];
  $("a[href],link[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const resolved = resolveSameOrigin(url, href);
    if (!resolved) return;
    links.push(resolved);
    if (element.tagName.toLowerCase() === "a") {
      anchors.push({ href: resolved, text: truncate($(element).text(), 160) });
    }
  });
  const forms = [];
  $("form").each((_, element) => {
    forms.push({
      action: $(element).attr("action"),
      method: $(element).attr("method")?.toUpperCase(),
      text: truncate($(element).text(), 220)
    });
  });
  const bodyText2 = truncate($("body").text(), 5e4);
  return {
    url,
    title: truncate($("title").first().text(), 160) || void 0,
    text: bodyText2,
    links: unique(links),
    anchors,
    forms,
    jsonLd,
    hasMicrodata: $("[itemscope],[itemtype],[itemprop]").length > 0
  };
}
function flattenJsonLd(values) {
  const out = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      out.push(value);
      const graph = value["@graph"];
      if (graph) visit(graph);
    }
  };
  values.forEach(visit);
  return out;
}
function jsonLdTypes(values) {
  const types = /* @__PURE__ */ new Set();
  for (const item of flattenJsonLd(values)) {
    const type = item["@type"];
    if (Array.isArray(type)) {
      type.forEach((entry) => {
        if (typeof entry === "string") types.add(entry.toLowerCase());
      });
    } else if (typeof type === "string") {
      types.add(type.toLowerCase());
    }
  }
  return [...types];
}
function jsonLdHasKey(values, key) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const object = value;
    return Object.prototype.hasOwnProperty.call(object, key) || Object.values(object).some(visit);
  };
  return values.some(visit);
}

// packages/core/src/openapi.ts
function looksLikeOpenApi(body, contentType = "") {
  const normalized = body.trim();
  if (!normalized) return false;
  if (/json|yaml|yml/i.test(contentType)) {
    if (/"openapi"\s*:\s*"3\.\d/.test(normalized)) return true;
    if (/"swagger"\s*:\s*"2\.0"/.test(normalized)) return true;
    if (/^openapi:\s*3\.\d/m.test(normalized)) return true;
    if (/^swagger:\s*["']?2\.0/m.test(normalized)) return true;
  }
  return normalized.includes('"paths"') && normalized.includes('"info"') && normalized.includes('"openapi"');
}

// packages/core/src/profile.ts
function inferProfile(snapshot) {
  const allJsonLd2 = snapshot.pages.flatMap((page) => page.jsonLd);
  const types = jsonLdTypes(allJsonLd2);
  const text2 = bodyText(snapshot.records);
  if (successful(snapshot.recordsByPath.get("/.well-known/agent-card.json"))) return "agent-service";
  if (successful(snapshot.recordsByPath.get("/.well-known/agent.json"))) return "agent-service";
  if (snapshot.records.some((record2) => looksLikeOpenApi(record2.body, record2.contentType))) return "api";
  if (hasAny(text2, ["model context protocol", "mcp server", "mcp endpoint"])) return "mcp-server";
  if (types.some((type) => ["product", "offer"].includes(type))) return "merchant";
  if (hasAny(text2, ["add to cart", "checkout", "shipping", "refund", "inventory"])) return "merchant";
  if (hasAny(text2, ["marketplace", "seller", "vendors", "list your service"])) return "marketplace";
  return "website";
}

// packages/core/src/snapshot.ts
var robotsParserModule = __toESM(require("robots-parser"), 1);

// src/public-fetch.ts
var import_node_async_hooks = require("node:async_hooks");
var import_node_dns = __toESM(require("node:dns"), 1);
var import_ipaddr = __toESM(require("ipaddr.js"), 1);
var import_undici = require("undici");
var scanContext = new import_node_async_hooks.AsyncLocalStorage();
function isPublicAddress(address) {
  try {
    return import_ipaddr.default.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
function validateUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const unsupportedAddress = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || !hostname.includes(".") && !import_ipaddr.default.isValid(hostname);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port) || unsupportedAddress || import_ipaddr.default.isValid(hostname) && !isPublicAddress(hostname)) {
    throw new Error("Only public HTTP(S) URLs on standard ports can be scanned.");
  }
  return url;
}
var dispatcher = new import_undici.Agent({
  connect: {
    // Validate the actual DNS results used by the socket, not a separate preflight.
    lookup(hostname, options, callback) {
      import_node_dns.default.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
          return callback(new Error("Private or reserved DNS destination blocked."));
        }
        if (options.all) return callback(null, addresses);
        const first = addresses[0];
        return callback(null, first.address, first.family);
      });
    }
  }
});
async function fetch(value, options = {}) {
  const context = scanContext.getStore();
  const isRootRequest = context ? context.requests++ === 0 : false;
  try {
    let url = validateUrl(value);
    if (context?.rootError) throw new Error(context.rootError);
    if (isRootRequest && context) context.origins = /* @__PURE__ */ new Set([url.origin]);
    if (context?.origins && !context.origins.has(url.origin)) {
      throw new Error("Cross-site scan requests are not allowed.");
    }
    const signal = context ? AbortSignal.any([context.signal, options.signal].filter((item) => Boolean(item))) : options.signal;
    for (let redirect = 0; redirect <= 4; redirect += 1) {
      signal?.throwIfAborted();
      const response = await (0, import_undici.fetch)(url, { ...options, signal, redirect: "manual", dispatcher });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirect === 4) throw new Error("Invalid or excessive redirects.");
        url = validateUrl(new URL(location, url));
        if (isRootRequest) context?.origins?.add(url.origin);
        else if (context?.origins && !context.origins.has(url.origin)) {
          throw new Error("Cross-site scan redirect blocked.");
        }
        continue;
      }
      if (isRootRequest && !response.ok) {
        context.rootError = `The website returned HTTP ${response.status}.`;
      }
      const chunks = [];
      let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value: value2 } = await reader.read();
            if (done) break;
            size += value2.byteLength;
            if (size > 75e4) {
              await reader.cancel();
              throw new Error("Response exceeds the scan size limit.");
            }
            chunks.push(Buffer.from(value2));
          }
        } finally {
          reader.releaseLock();
        }
      }
      const body = Buffer.concat(chunks);
      return {
        url: url.href,
        redirected: redirect > 0,
        headers: response.headers,
        status: response.status,
        ok: response.ok,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
      };
    }
    throw new Error("Invalid or excessive redirects.");
  } catch (error) {
    if (isRootRequest && context) {
      context.rootError = error instanceof Error ? error.message : "The website could not be fetched.";
    }
    throw error;
  }
}

// packages/core/src/http.ts
var DEFAULT_USER_AGENT = "AgentReady/0.1.0-alpha.0 (+https://github.com/swarmclawai/agentready; passive scanner)";
var MAX_BODY_BYTES = 75e4;
var HttpClient = class {
  constructor(options) {
    this.options = options;
  }
  requests = 0;
  lastRequestAt = 0;
  records = [];
  get remainingRequests() {
    return Math.max(0, this.options.maxRequests - this.requests);
  }
  async request(url, method = "GET") {
    if (this.requests >= this.options.maxRequests) {
      return this.recordError(url, method, "max request limit reached", 0);
    }
    this.requests += 1;
    await this.throttle();
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const init = {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": DEFAULT_USER_AGENT,
          accept: method === "HEAD" ? "*/*" : "text/html,application/xhtml+xml,application/json,application/xml,text/plain,*/*;q=0.8"
        }
      };
      const response = await fetch(url, init);
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const contentType = headers["content-type"] ?? "";
      let body = "";
      if (method === "GET" && shouldReadBody(contentType)) {
        const raw = await response.arrayBuffer();
        const bytes = raw.byteLength > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw;
        body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      }
      const record2 = {
        url: response.url,
        requestedUrl: url,
        method,
        status: response.status,
        ok: response.ok,
        redirected: response.redirected,
        contentType,
        headers,
        body,
        elapsedMs: Date.now() - started
      };
      this.records.push(record2);
      return record2;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.recordError(url, method, message, Date.now() - started);
    } finally {
      clearTimeout(timeout);
    }
  }
  recordError(url, method, error, elapsedMs) {
    const record2 = {
      url,
      requestedUrl: url,
      method,
      status: 0,
      ok: false,
      redirected: false,
      contentType: "",
      headers: {},
      body: "",
      error,
      elapsedMs
    };
    this.records.push(record2);
    return record2;
  }
  async throttle() {
    const rps = this.options.rateLimit.requestsPerSecond;
    if (!Number.isFinite(rps) || rps <= 0) return;
    const minGap = 1e3 / rps;
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < minGap) {
      await new Promise((resolve) => setTimeout(resolve, minGap - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
};
function shouldReadBody(contentType) {
  const normalized = contentType.toLowerCase();
  if (!normalized) return true;
  return [
    "text/",
    "application/json",
    "application/ld+json",
    "application/xml",
    "application/rss+xml",
    "application/atom+xml",
    "application/xhtml+xml",
    "application/yaml",
    "application/x-yaml"
  ].some((allowed) => normalized.includes(allowed));
}

// packages/core/src/sitemap.ts
var import_fast_xml_parser = require("fast-xml-parser");
function parseSitemapUrls(xml) {
  if (!xml.trim()) return [];
  try {
    const parser = new import_fast_xml_parser.XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    return extractLocs(parsed).filter((url) => /^https?:\/\//i.test(url));
  } catch {
    return [];
  }
}
function extractLocs(value) {
  if (Array.isArray(value)) return value.flatMap(extractLocs);
  if (!value || typeof value !== "object") return [];
  const object = value;
  const current = typeof object.loc === "string" ? [object.loc] : [];
  return current.concat(Object.values(object).flatMap(extractLocs));
}

// packages/core/src/snapshot.ts
var BASE_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/index.html.md",
  "/agents.txt",
  "/ai.txt",
  "/agent-policy",
  "/bot-policy",
  "/crawler-policy",
  "/.well-known/security.txt",
  "/.well-known/agent-card.json",
  "/.well-known/agent.json",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/.well-known/web-bot-auth",
  "/.well-known/signature-agent-directory",
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/api/openapi.json",
  "/docs",
  "/api",
  "/pricing",
  "/support",
  "/contact",
  "/returns",
  "/refunds",
  "/return-policy",
  "/cancellation",
  "/shipping",
  "/terms",
  "/privacy",
  "/cart",
  "/checkout",
  "/admin",
  "/webhooks",
  "/status"
];
var KEYWORD_LINKS = [
  "price",
  "pricing",
  "docs",
  "api",
  "support",
  "contact",
  "refund",
  "return",
  "cancel",
  "shipping",
  "checkout",
  "cart",
  "terms",
  "privacy",
  "openapi",
  "swagger",
  "mcp",
  "agent",
  "bot",
  "security",
  "webhook",
  "rate"
];
var parseRobots = robotsParserModule.default ?? robotsParserModule;
async function collectSnapshot(options) {
  const started = /* @__PURE__ */ new Date();
  const targetUrl = normalizeTarget(options.target);
  const origin = targetUrl.origin;
  const client = new HttpClient(options);
  const root = await client.request(targetUrl.href);
  const robots = await client.request(rootPath(origin, "/robots.txt"));
  const robotsRules = robots.status >= 200 && robots.status < 300 ? parseRobots(rootPath(origin, "/robots.txt"), robots.body) : void 0;
  const initialPages = root.contentType.includes("html") || root.body.includes("<html") ? [parseHtmlPage(root.url, root.body)] : [];
  const discoveredFromRoot = initialPages.flatMap(
    (page) => page.anchors.filter((anchor) => KEYWORD_LINKS.some((keyword) => anchor.href.toLowerCase().includes(keyword) || anchor.text.toLowerCase().includes(keyword))).map((anchor) => anchor.href)
  );
  const candidateUrls = unique(BASE_PATHS.map((path) => rootPath(origin, path)).concat(discoveredFromRoot));
  const skippedByRobots = [];
  for (const url of candidateUrls) {
    if (client.remainingRequests <= 0) break;
    if (url === root.url || url === root.requestedUrl || pathKey(url) === "/robots.txt") continue;
    if (options.respectRobots && robotsRules && !robotsRules.isAllowed(url, DEFAULT_USER_AGENT)) {
      skippedByRobots.push(url);
      continue;
    }
    await client.request(url);
  }
  const sitemapRecord = client.records.find((record2) => pathKey(record2.url) === "/sitemap.xml" || pathKey(record2.requestedUrl) === "/sitemap.xml");
  const sitemapUrls = sitemapRecord ? parseSitemapUrls(sitemapRecord.body).filter((url) => resolveSameOrigin(origin, url)) : [];
  for (const url of sitemapUrls.slice(0, Math.max(0, options.maxPages - client.records.length))) {
    if (client.remainingRequests <= 0) break;
    if (options.respectRobots && robotsRules && !robotsRules.isAllowed(url, DEFAULT_USER_AGENT)) {
      skippedByRobots.push(url);
      continue;
    }
    await client.request(url);
  }
  const pages = initialPages.concat(
    client.records.filter((record2) => record2 !== root).filter((record2) => record2.body && (record2.contentType.includes("html") || record2.body.includes("<html"))).slice(0, options.maxPages).map((record2) => parseHtmlPage(record2.url, record2.body))
  );
  const recordsByPath = /* @__PURE__ */ new Map();
  for (const record2 of client.records) {
    recordsByPath.set(pathKey(record2.requestedUrl), record2);
    recordsByPath.set(pathKey(record2.url), record2);
  }
  const completed = /* @__PURE__ */ new Date();
  return {
    target: options.target,
    normalizedTarget: targetUrl.href,
    origin,
    root,
    records: client.records,
    recordsByPath,
    pages,
    ...robots ? { robots } : {},
    sitemapUrls,
    skippedByRobots,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    elapsedMs: completed.getTime() - started.getTime(),
    userAgent: DEFAULT_USER_AGENT
  };
}

// packages/core/src/score.ts
var profileWeights = {
  website: [
    { key: "discoverability", label: "Discoverability", weight: 35, categories: ["discoverability"] },
    { key: "access-policy", label: "Agent access policy", weight: 20, categories: ["access-policy"] },
    { key: "content", label: "Content structure", weight: 20, categories: ["api", "agent-service"] },
    { key: "support", label: "Support and policies", weight: 10, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 15, categories: ["security"] }
  ],
  merchant: [
    { key: "discoverability", label: "Discoverability", weight: 20, categories: ["discoverability"] },
    { key: "access-policy", label: "Agent access policy", weight: 15, categories: ["access-policy"] },
    { key: "commerce", label: "Commerce readiness", weight: 25, categories: ["commerce"] },
    { key: "payment", label: "Payment and receipts", weight: 15, categories: ["payment"] },
    { key: "support", label: "Refund, support, and disputes", weight: 15, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 10, categories: ["security"] }
  ],
  api: [
    { key: "discoverability", label: "Discoverability", weight: 20, categories: ["discoverability"] },
    { key: "access-policy", label: "Agent access policy", weight: 10, categories: ["access-policy"] },
    { key: "api", label: "API readiness", weight: 30, categories: ["api"] },
    { key: "payment", label: "Payment and receipts", weight: 20, categories: ["payment"] },
    { key: "support", label: "Support and limits", weight: 10, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 10, categories: ["security"] }
  ],
  marketplace: [
    { key: "discoverability", label: "Discoverability", weight: 20, categories: ["discoverability"] },
    { key: "access-policy", label: "Agent access policy", weight: 15, categories: ["access-policy"] },
    { key: "commerce", label: "Marketplace readiness", weight: 25, categories: ["commerce", "agent-service"] },
    { key: "payment", label: "Payment and receipts", weight: 15, categories: ["payment"] },
    { key: "support", label: "Refund, support, and disputes", weight: 15, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 10, categories: ["security"] }
  ],
  "mcp-server": [
    { key: "discoverability", label: "Discoverability", weight: 15, categories: ["discoverability"] },
    { key: "mcp", label: "MCP readiness", weight: 35, categories: ["mcp"] },
    { key: "api", label: "API readiness", weight: 15, categories: ["api"] },
    { key: "payment", label: "Payment and receipts", weight: 10, categories: ["payment"] },
    { key: "support", label: "Support and limits", weight: 10, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 15, categories: ["security"] }
  ],
  "agent-service": [
    { key: "discoverability", label: "Discoverability", weight: 15, categories: ["discoverability"] },
    { key: "a2a", label: "A2A readiness", weight: 25, categories: ["a2a"] },
    { key: "agent-service", label: "Agent service readiness", weight: 20, categories: ["agent-service"] },
    { key: "payment", label: "Payment and receipts", weight: 15, categories: ["payment"] },
    { key: "support", label: "Refund, support, and disputes", weight: 10, categories: ["support"] },
    { key: "security", label: "Security and safety", weight: 15, categories: ["security"] }
  ]
};
function summarize(findings) {
  return {
    critical: findings.filter((finding2) => finding2.status !== "pass" && finding2.severity === "critical").length,
    major: findings.filter((finding2) => finding2.status !== "pass" && finding2.severity === "major").length,
    minor: findings.filter((finding2) => finding2.status !== "pass" && finding2.severity === "minor").length,
    info: findings.filter((finding2) => finding2.severity === "info" || finding2.status === "info").length,
    pass: findings.filter((finding2) => finding2.status === "pass").length,
    fail: findings.filter((finding2) => finding2.status === "fail").length,
    warn: findings.filter((finding2) => finding2.status === "warn").length,
    unknown: findings.filter((finding2) => finding2.status === "unknown").length
  };
}
function scoreFindings(profile, findings) {
  const sections = profileWeights[profile];
  const scores = sections.map((section) => {
    const sectionFindings = findings.filter(
      (finding2) => section.categories.includes(finding2.category) && finding2.status !== "info" && finding2.status !== "not_applicable"
    );
    if (sectionFindings.length === 0) {
      return { key: section.key, label: section.label, weight: section.weight, score: section.weight, applicableFindings: 0 };
    }
    const raw = sectionFindings.reduce((sum, finding2) => sum + statusValue(finding2.status), 0) / sectionFindings.length;
    return {
      key: section.key,
      label: section.label,
      weight: section.weight,
      score: Math.round(raw * section.weight),
      applicableFindings: sectionFindings.length
    };
  });
  return {
    score: Math.max(0, Math.min(100, scores.reduce((sum, section) => sum + section.score, 0))),
    scores
  };
}
function statusValue(status) {
  switch (status) {
    case "pass":
      return 1;
    case "warn":
      return 0.5;
    case "unknown":
      return 0.25;
    case "fail":
      return 0;
    case "info":
    case "not_applicable":
      return 1;
  }
}

// packages/core/src/scanner.ts
async function runScan(options, rules) {
  const normalizedOptions = normalizeOptions(options);
  const snapshot = await collectSnapshot(normalizedOptions);
  const profile = normalizedOptions.profile === "auto" ? inferProfile(snapshot) : normalizedOptions.profile;
  const selectedRules = rules.filter((rule) => {
    if (!rule.profiles.includes(profile)) return false;
    if (normalizedOptions.include.length > 0 && !normalizedOptions.include.some((item) => rule.id.includes(item) || rule.category === item)) {
      return false;
    }
    if (normalizedOptions.exclude.some((item) => rule.id.includes(item) || rule.category === item)) return false;
    return true;
  });
  const findings = [];
  for (const rule of selectedRules) {
    try {
      const finding2 = await rule.run({ profile, snapshot, options: normalizedOptions });
      findings.push({ ...finding2, source: finding2.source ?? rule.source });
    } catch (error) {
      findings.push({
        id: rule.id,
        title: rule.title,
        category: rule.category,
        severity: "major",
        status: "unknown",
        evidence: [{ message: `Rule failed: ${error instanceof Error ? error.message : String(error)}` }],
        recommendation: "Open an AgentReady issue with the target and command used so this rule can be fixed.",
        source: rule.source
      });
    }
  }
  const { score, scores } = scoreFindings(profile, findings);
  return {
    agentreadyVersion: agentReadyVersion,
    target: options.target,
    normalizedTarget: snapshot.normalizedTarget,
    profile,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
    score,
    scores,
    summary: summarize(findings),
    findings,
    metadata: {
      fetchedUrls: snapshot.records.length,
      skippedByRobots: snapshot.skippedByRobots,
      userAgent: snapshot.userAgent,
      elapsedMs: snapshot.elapsedMs,
      active: normalizedOptions.active,
      browser: normalizedOptions.browser
    }
  };
}

// packages/core/src/llms.ts
function parseLlmsTxt(markdown) {
  const lines = markdown.split(/\r?\n/);
  const hasH1 = lines.some((line) => /^#\s+\S/.test(line.trim()));
  const summaryLine = lines.find((line) => /^>\s+/.test(line.trim()));
  const headings = lines.filter((line) => /^##\s+\S/.test(line.trim()));
  const hasOptionalSection = headings.some((line) => /^##\s+optional\s*$/i.test(line.trim()));
  const links = [];
  const linkPattern = /^\s*[-*]\s+\[([^\]]+)]\(([^)]+)\)(?::\s*(.+))?\s*$/;
  for (const line of lines) {
    const match = linkPattern.exec(line);
    if (!match) continue;
    links.push({
      label: match[1] ?? "",
      url: match[2] ?? "",
      ...match[3] ? { notes: match[3] } : {}
    });
  }
  return {
    hasH1,
    ...summaryLine ? { summary: summaryLine.replace(/^>\s*/, "").trim() } : {},
    sectionCount: headings.length,
    links,
    hasOptionalSection
  };
}

// packages/rules/src/helpers.ts
var allProfiles = [...profiles];
var commerceProfiles = ["merchant", "marketplace"];
var apiProfiles = ["api", "marketplace", "mcp-server", "agent-service"];
var agentProfiles = ["agent-service", "marketplace"];
var mcpProfiles = ["mcp-server", "api"];
function defineRule(definition, run) {
  return { ...definition, profiles: [...new Set(definition.profiles)], run };
}
function finding(definition, status, evidenceItems, override) {
  return {
    id: definition.id,
    title: definition.title,
    category: definition.category,
    severity: override?.severity ?? definition.severity,
    status,
    evidence: evidenceItems,
    recommendation: override?.recommendation ?? definition.recommendation,
    source: definition.source
  };
}
function record(ctx, path) {
  return ctx.snapshot.recordsByPath.get(path);
}
function text(ctx) {
  return bodyText(ctx.snapshot.records);
}
function anyText(ctx, needles) {
  return hasAny(text(ctx), needles);
}
function allJsonLd(ctx) {
  return ctx.snapshot.pages.flatMap((page) => page.jsonLd);
}
function hasJsonLdType(ctx, types) {
  const available = jsonLdTypes(allJsonLd(ctx));
  const wanted = new Set(types.map((type) => type.toLowerCase()));
  return available.some((type) => wanted.has(type));
}
function hasJsonLdKey(ctx, key) {
  return jsonLdHasKey(allJsonLd(ctx), key);
}
function jsonLdObjects(ctx) {
  return flattenJsonLd(allJsonLd(ctx)).filter((item) => Boolean(item && typeof item === "object"));
}
function firstSuccessfulPath(ctx, paths) {
  return paths.map((path) => record(ctx, path)).find(successful);
}
function hasLinkText(ctx, needles) {
  return ctx.snapshot.pages.some(
    (page) => page.anchors.some((anchor) => hasAny(`${anchor.href} ${anchor.text}`, needles))
  );
}
function openApiRecords(ctx) {
  return ctx.snapshot.records.filter((item) => looksLikeOpenApi(item.body, item.contentType));
}
function hasCorsWildcardWithCredentials(ctx) {
  return ctx.snapshot.records.some(
    (item) => header(item, "access-control-allow-origin") === "*" && header(item, "access-control-allow-credentials")?.toLowerCase() === "true"
  );
}
function hasCorsWildcard(ctx) {
  return ctx.snapshot.records.some((item) => header(item, "access-control-allow-origin") === "*");
}
function llmsRecord(ctx) {
  return record(ctx, "/llms.txt");
}
function parsedLlms(ctx) {
  const item = llmsRecord(ctx);
  if (!item || !successful(item)) return void 0;
  return parseLlmsTxt(item.body);
}
function safeMissingEvidence(path, item) {
  return evidence(`${path} not available (${statusLabel(item)}).`, item?.url);
}
function regexEvidence(ctx, pattern, label) {
  const found = [];
  for (const item of ctx.snapshot.records) {
    pattern.lastIndex = 0;
    if (pattern.test(item.body)) {
      found.push(evidence(label, item.url));
      if (found.length >= 5) break;
    }
  }
  return found;
}
function sourceUrl(kind) {
  switch (kind) {
    case "llms":
      return "https://llmstxt.org/index.html";
    case "x402":
      return "https://github.com/coinbase/x402";
    case "mcp":
      return "https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization";
    case "a2a":
      return "https://github.com/a2aproject/A2A/blob/main/docs/specification.md";
    case "web-bot-auth":
      return "https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/";
    case "ap2":
      return "https://ap2-protocol.org/specification/";
  }
}
function baseDefinition(input) {
  return { points: 1, ...input };
}
function recordStatusEvidence(ctx, path) {
  const item = record(ctx, path);
  return evidence(`${path}: ${statusLabel(item)}.`, item?.url);
}
function checkoutForms(ctx) {
  return ctx.snapshot.pages.flatMap((page) => page.forms).filter((form) => hasAny(`${form.action ?? ""} ${form.text}`, ["checkout", "cart", "payment", "order"])).length;
}
function hasJsonOfferPrice(ctx) {
  return jsonLdObjects(ctx).some((item) => {
    const type = item["@type"];
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
    return types.some((entry) => entry.toLowerCase() === "offer") && (item.price !== void 0 || item.priceSpecification !== void 0);
  });
}
function securityRegexes() {
  return [
    /sk-[A-Za-z0-9_-]{20,}/,
    /gh[pousr]_[A-Za-z0-9_]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/
  ];
}

// packages/rules/src/builtins.ts
var builtInRules = [
  defineRule(
    baseDefinition({
      id: "discoverability.robots_txt",
      title: "robots.txt is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks whether the target exposes robots.txt.",
      recommendation: "Publish robots.txt so automated clients can understand crawl preferences."
    }),
    (ctx) => {
      const item = record(ctx, "/robots.txt");
      if (item && successful(item)) return finding(builtInRules[0], "pass", [evidence("robots.txt found.", item.url)]);
      return finding(builtInRules[0], "warn", [safeMissingEvidence("/robots.txt", item)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.sitemap_xml",
      title: "sitemap.xml is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks whether the target exposes a sitemap.",
      recommendation: "Publish sitemap.xml or reference sitemap locations from robots.txt."
    }),
    (ctx) => {
      const item = record(ctx, "/sitemap.xml");
      if (item && successful(item) && ctx.snapshot.sitemapUrls.length > 0) {
        return finding(builtInRules[1], "pass", [evidence(`sitemap.xml found with ${ctx.snapshot.sitemapUrls.length} URLs.`, item.url)]);
      }
      if (item && successful(item)) return finding(builtInRules[1], "warn", [evidence("sitemap.xml was found but no URLs were parsed.", item.url)]);
      return finding(builtInRules[1], "warn", [safeMissingEvidence("/sitemap.xml", item)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.llms_txt",
      title: "llms.txt is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks whether the target exposes /llms.txt.",
      recommendation: "Add /llms.txt with a concise Markdown map of agent-relevant pages.",
      source: sourceUrl("llms")
    }),
    (ctx) => {
      const item = llmsRecord(ctx);
      if (item && successful(item)) return finding(builtInRules[2], "pass", [evidence("llms.txt found.", item.url)]);
      return finding(builtInRules[2], "warn", [safeMissingEvidence("/llms.txt", item)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.llms_txt_format",
      title: "llms.txt follows the proposed format",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks for an H1 and useful Markdown link list in llms.txt.",
      recommendation: "Structure llms.txt with an H1, optional summary, and Markdown file lists.",
      source: sourceUrl("llms")
    }),
    (ctx) => {
      const item = llmsRecord(ctx);
      const parsed = parsedLlms(ctx);
      if (!parsed || !item) return finding(builtInRules[3], "not_applicable", [safeMissingEvidence("/llms.txt", item)]);
      if (parsed.hasH1 && parsed.links.length > 0) {
        return finding(builtInRules[3], "pass", [evidence(`llms.txt has an H1 and ${parsed.links.length} linked resources.`, item.url)]);
      }
      if (parsed.hasH1) return finding(builtInRules[3], "warn", [evidence("llms.txt has an H1 but no Markdown resource links.", item.url)]);
      return finding(builtInRules[3], "fail", [evidence("llms.txt is missing the required H1 title.", item.url)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.llms_full_txt",
      title: "llms-full.txt is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "info",
      description: "Checks whether the optional /llms-full.txt file is available.",
      recommendation: "Consider publishing /llms-full.txt for compact full-context agent reads.",
      source: sourceUrl("llms")
    }),
    (ctx) => {
      const item = record(ctx, "/llms-full.txt");
      if (item && successful(item)) return finding(builtInRules[4], "pass", [evidence("llms-full.txt found.", item.url)]);
      return finding(builtInRules[4], "info", [safeMissingEvidence("/llms-full.txt", item)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.markdown_fallback",
      title: "Markdown fallback is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks for Markdown page mirrors or linked .md resources.",
      recommendation: "Expose clean Markdown alternatives for high-value pages where possible.",
      source: sourceUrl("llms")
    }),
    (ctx) => {
      const mdRecord = record(ctx, "/index.html.md");
      const hasMdLink = ctx.snapshot.pages.some((page) => page.links.some((link) => link.endsWith(".md")));
      if (successful(mdRecord) || hasMdLink) {
        return finding(builtInRules[5], "pass", [evidence("Markdown fallback signal found.", mdRecord?.url ?? ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[5], "warn", [safeMissingEvidence("/index.html.md", mdRecord)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.structured_data",
      title: "Structured data is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "major",
      description: "Checks for JSON-LD or microdata.",
      recommendation: "Add JSON-LD or microdata that describes the organization, products, services, docs, or API."
    }),
    (ctx) => {
      const jsonLdCount = ctx.snapshot.pages.flatMap((page) => page.jsonLd).length;
      const hasMicrodata = ctx.snapshot.pages.some((page) => page.hasMicrodata);
      if (jsonLdCount > 0 || hasMicrodata) {
        return finding(builtInRules[6], "pass", [evidence(`Structured data found (${jsonLdCount} JSON-LD blocks, microdata: ${hasMicrodata}).`, ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[6], "warn", [evidence("No JSON-LD or microdata found in fetched pages.", ctx.snapshot.root.url)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "discoverability.service_schema",
      title: "Service or organization schema is available",
      profiles: allProfiles,
      category: "discoverability",
      severity: "minor",
      description: "Checks whether structured data explains the service or organization.",
      recommendation: "Add Organization, LocalBusiness, WebSite, SoftwareApplication, or Service JSON-LD."
    }),
    (ctx) => {
      if (hasJsonLdType(ctx, ["Organization", "LocalBusiness", "WebSite", "SoftwareApplication", "Service"])) {
        return finding(builtInRules[7], "pass", [evidence("Service or organization JSON-LD type found.", ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[7], "warn", [evidence("No service or organization schema found.", ctx.snapshot.root.url)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "access.agent_access_policy",
      title: "Agent access policy is published",
      profiles: allProfiles,
      category: "access-policy",
      severity: "major",
      description: "Checks for a public agent, bot, or crawler access policy.",
      recommendation: "Publish an agent access policy that explains allowed agent behavior, rate limits, and contact paths."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/agents.txt", "/agent-policy", "/bot-policy", "/crawler-policy", "/ai.txt"]);
      if (item) return finding(builtInRules[8], "pass", [evidence("Agent access policy signal found.", item.url)]);
      if (anyText(ctx, ["agent access policy", "bot policy", "crawler policy", "ai agent policy"])) {
        return finding(builtInRules[8], "pass", [evidence("Agent access policy text found in fetched pages.", ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[8], "warn", [evidence("No explicit agent access policy found in fetched pages.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "access.web_bot_auth_hints",
      title: "Signed-agent or Web Bot Auth hints are available",
      profiles: allProfiles,
      category: "access-policy",
      severity: "minor",
      description: "Checks for Web Bot Auth, Signature-Agent, or public key directory hints.",
      recommendation: "Document signed-agent support or public-key directory behavior if verified agents are supported.",
      source: sourceUrl("web-bot-auth")
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/.well-known/web-bot-auth", "/.well-known/signature-agent-directory"]);
      if (item) return finding(builtInRules[9], "pass", [evidence("Signed-agent discovery endpoint found.", item.url)]);
      if (anyText(ctx, ["web bot auth", "signature-agent", "signed agent", "public key directory"])) {
        return finding(builtInRules[9], "pass", [evidence("Signed-agent documentation text found.", ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[9], "unknown", [evidence("No signed-agent authentication hints found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.product_schema",
      title: "Product schema is available",
      profiles: commerceProfiles,
      category: "commerce",
      severity: "critical",
      description: "Checks for Product JSON-LD.",
      recommendation: "Expose Product and Offer JSON-LD on product pages."
    }),
    (ctx) => {
      if (hasJsonLdType(ctx, ["Product"])) return finding(builtInRules[10], "pass", [evidence("Product JSON-LD found.", ctx.snapshot.root.url)]);
      return finding(builtInRules[10], "fail", [evidence("No Product JSON-LD found in fetched pages.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.price_visible",
      title: "Price data is visible",
      profiles: commerceProfiles,
      category: "commerce",
      severity: "critical",
      description: "Checks whether price data is available in structured data or visible content.",
      recommendation: "Expose prices in Offer JSON-LD and visible text near product/service descriptions."
    }),
    (ctx) => {
      if (hasJsonOfferPrice(ctx)) return finding(builtInRules[11], "pass", [evidence("Offer price found in JSON-LD.", ctx.snapshot.root.url)]);
      if (/\$\s?\d|£\s?\d|€\s?\d|\bUSD\b|\bGBP\b|\bEUR\b/i.test(text(ctx))) {
        return finding(builtInRules[11], "warn", [evidence("Price-like text found, but not structured as Offer JSON-LD.", ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[11], "fail", [evidence("No price signal found in fetched pages.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.inventory_signal",
      title: "Inventory or availability signal is available",
      profiles: commerceProfiles,
      category: "commerce",
      severity: "major",
      description: "Checks for availability or stock signals.",
      recommendation: "Expose availability in Product/Offer JSON-LD and visible text."
    }),
    (ctx) => {
      if (hasJsonLdKey(ctx, "availability") || anyText(ctx, ["in stock", "out of stock", "availability", "inventory"])) {
        return finding(builtInRules[12], "pass", [evidence("Inventory or availability signal found.", ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[12], "unknown", [evidence("No inventory freshness signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.checkout_detected",
      title: "Cart or checkout path is detectable",
      profiles: commerceProfiles,
      category: "commerce",
      severity: "critical",
      description: "Checks for cart and checkout links, pages, or forms.",
      recommendation: "Expose stable cart and checkout paths and document agent-safe purchase constraints."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/cart", "/checkout"]);
      if (item || hasLinkText(ctx, ["cart", "checkout"]) || checkoutForms(ctx) > 0) {
        return finding(builtInRules[13], "pass", [evidence("Cart or checkout signal found.", item?.url ?? ctx.snapshot.root.url)]);
      }
      return finding(builtInRules[13], "fail", [evidence("No cart or checkout path detected.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.shipping_tax_clarity",
      title: "Shipping and tax information is discoverable",
      profiles: commerceProfiles,
      category: "commerce",
      severity: "major",
      description: "Checks for shipping and tax policy signals.",
      recommendation: "Publish crawlable shipping, delivery, tax, and fee information."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/shipping"]);
      if (item && anyText(ctx, ["shipping", "delivery"])) return finding(builtInRules[14], "pass", [evidence("Shipping policy found.", item.url)]);
      if (anyText(ctx, ["shipping", "delivery", "tax", "fees"])) return finding(builtInRules[14], "warn", [evidence("Shipping/tax text found but no dedicated fetched policy page was confirmed.")]);
      return finding(builtInRules[14], "unknown", [evidence("No shipping or tax clarity signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.refund_policy_detected",
      title: "Refund or return policy is detectable",
      profiles: commerceProfiles,
      category: "support",
      severity: "critical",
      description: "Checks for refund and return policy pages.",
      recommendation: "Publish a crawlable refund/return policy with time windows, eligibility, and escalation paths."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/refunds", "/returns", "/return-policy"]);
      if (item) return finding(builtInRules[15], "pass", [evidence("Refund or return policy page found.", item.url)]);
      if (anyText(ctx, ["refund", "return policy", "returns"])) return finding(builtInRules[15], "warn", [evidence("Refund/return text found but no dedicated fetched policy page was confirmed.")]);
      return finding(builtInRules[15], "fail", [evidence("No refund or return policy signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.cancellation_policy_detected",
      title: "Cancellation policy is detectable",
      profiles: commerceProfiles,
      category: "support",
      severity: "critical",
      description: "Checks for cancellation policy signals.",
      recommendation: "Publish cancellation rules and cancellation request paths in crawlable text."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/cancellation"]);
      if (item) return finding(builtInRules[16], "pass", [evidence("Cancellation policy page found.", item.url)]);
      if (anyText(ctx, ["cancel order", "cancellation", "subscription cancellation"])) return finding(builtInRules[16], "warn", [evidence("Cancellation text found but no dedicated policy page was confirmed.")]);
      return finding(builtInRules[16], "fail", [evidence("No cancellation policy signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "commerce.support_path_detected",
      title: "Support path is detectable",
      profiles: allProfiles,
      category: "support",
      severity: "major",
      description: "Checks for support or contact paths.",
      recommendation: "Publish crawlable support/contact pages and expected response paths."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/support", "/contact"]);
      if (item) return finding(builtInRules[17], "pass", [evidence("Support or contact page found.", item.url)]);
      if (anyText(ctx, ["support", "contact us", "help center"])) return finding(builtInRules[17], "warn", [evidence("Support text found but no dedicated fetched support/contact page was confirmed.")]);
      return finding(builtInRules[17], "warn", [evidence("No support or contact path detected.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "support.response_time_detected",
      title: "Support response expectations are published",
      profiles: allProfiles,
      category: "support",
      severity: "minor",
      description: "Checks whether support pages mention expected response time or SLA.",
      recommendation: "Document expected response windows, escalation paths, or SLA terms."
    }),
    (ctx) => {
      if (anyText(ctx, ["response time", "within 24 hours", "within 48 hours", "sla", "service level"])) {
        return finding(builtInRules[18], "pass", [evidence("Support response expectation text found.")]);
      }
      return finding(builtInRules[18], "unknown", [evidence("No support response expectation found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "payment.http_402_detected",
      title: "HTTP 402 behavior is detectable",
      profiles: apiProfiles.concat(commerceProfiles),
      category: "payment",
      severity: "info",
      description: "Checks whether any fetched endpoint returned HTTP 402.",
      recommendation: "For paid APIs/resources, consider documenting 402 behavior and machine-readable payment requirements.",
      source: sourceUrl("x402")
    }),
    (ctx) => {
      const item = ctx.snapshot.records.find((entry) => entry.status === 402);
      if (item) return finding(builtInRules[19], "pass", [evidence("HTTP 402 response detected.", item.url)]);
      return finding(builtInRules[19], "info", [evidence("No HTTP 402 response detected in passive probes.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "payment.x402_metadata_detected",
      title: "x402 metadata is detectable",
      profiles: apiProfiles.concat(commerceProfiles),
      category: "payment",
      severity: "major",
      description: "Checks for x402 payment headers or response metadata.",
      recommendation: "Expose x402 PaymentRequired metadata for paid resources when using HTTP-native payments.",
      source: sourceUrl("x402")
    }),
    (ctx) => {
      const item = ctx.snapshot.records.find((entry) => header(entry, "payment-required") || header(entry, "payment-response") || hasAny(entry.body, ["paymentrequirements", "x402", "payment-required"]));
      if (item) return finding(builtInRules[20], "pass", [evidence("x402 metadata signal found.", item.url)]);
      return finding(builtInRules[20], "unknown", [evidence("No x402 metadata detected in passive probes.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "payment.signed_receipt_detected",
      title: "Signed receipt support is detectable",
      profiles: apiProfiles.concat(commerceProfiles).concat(agentProfiles),
      category: "payment",
      severity: "major",
      description: "Checks for signed receipt or verifiable receipt hints.",
      recommendation: "Document receipt format, signature, verification endpoint, and refund linkage for completed transactions."
    }),
    (ctx) => {
      if (anyText(ctx, ["signed receipt", "verifiable receipt", "receipt signature", "payment receipt"])) {
        return finding(builtInRules[21], "pass", [evidence("Signed receipt documentation signal found.")]);
      }
      return finding(builtInRules[21], "warn", [evidence("No signed receipt support signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "payment.ap2_mandate_hints",
      title: "AP2 mandate or agent payment hints are detectable",
      profiles: commerceProfiles.concat(apiProfiles).concat(agentProfiles),
      category: "payment",
      severity: "info",
      description: "Checks for AP2, payment mandate, or agent-payment contract hints.",
      recommendation: "If supporting agentic payment mandates, publish clear AP2 or mandate documentation.",
      source: sourceUrl("ap2")
    }),
    (ctx) => {
      if (anyText(ctx, ["agent payments protocol", "ap2", "paymentmandate", "payment mandate", "shopping mandate"])) {
        return finding(builtInRules[22], "pass", [evidence("AP2 or mandate terminology found.")]);
      }
      return finding(builtInRules[22], "info", [evidence("No AP2 or payment mandate signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "api.openapi_detected",
      title: "OpenAPI document is detectable",
      profiles: apiProfiles,
      category: "api",
      severity: "critical",
      description: "Checks for OpenAPI or Swagger documents.",
      recommendation: "Publish an OpenAPI document at a stable URL such as /openapi.json."
    }),
    (ctx) => {
      const records = openApiRecords(ctx);
      if (records.length > 0) return finding(builtInRules[23], "pass", [evidence("OpenAPI/Swagger document found.", records[0]?.url)]);
      if (hasLinkText(ctx, ["openapi", "swagger", "api reference"])) return finding(builtInRules[23], "warn", [evidence("API docs link found, but no OpenAPI document was fetched.")]);
      return finding(builtInRules[23], "fail", [evidence("No OpenAPI or Swagger document detected.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "api.auth_documentation_detected",
      title: "API auth documentation is detectable",
      profiles: apiProfiles,
      category: "api",
      severity: "major",
      description: "Checks for API authentication documentation.",
      recommendation: "Document authentication schemes, token handling, and authorization boundaries."
    }),
    (ctx) => {
      if (anyText(ctx, ["api key", "bearer token", "oauth", "authentication", "authorization header"])) {
        return finding(builtInRules[24], "pass", [evidence("API auth documentation signal found.")]);
      }
      return finding(builtInRules[24], "warn", [evidence("No API auth documentation signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "api.idempotency_guidance_detected",
      title: "Idempotency guidance is detectable",
      profiles: apiProfiles,
      category: "api",
      severity: "critical",
      description: "Checks for idempotency guidance for paid or mutating actions.",
      recommendation: "Document idempotency keys and retry behavior for paid or mutating actions."
    }),
    (ctx) => {
      if (anyText(ctx, ["idempotency-key", "idempotency key", "idempotent", "safe retry"])) {
        return finding(builtInRules[25], "pass", [evidence("Idempotency guidance found.")]);
      }
      return finding(builtInRules[25], "fail", [evidence("No idempotency guidance found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "api.webhook_documentation_detected",
      title: "Webhook documentation is detectable",
      profiles: apiProfiles,
      category: "api",
      severity: "minor",
      description: "Checks for webhook documentation.",
      recommendation: "Document webhook event types, signatures, retries, and delivery guarantees."
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/webhooks"]);
      if (item || anyText(ctx, ["webhook", "webhooks"])) return finding(builtInRules[26], "pass", [evidence("Webhook documentation signal found.", item?.url)]);
      return finding(builtInRules[26], "unknown", [evidence("No webhook documentation signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "api.rate_limit_guidance_detected",
      title: "Rate-limit guidance is detectable",
      profiles: apiProfiles.concat(allProfiles),
      category: "api",
      severity: "major",
      description: "Checks for rate-limit documentation or headers.",
      recommendation: "Document rate limits and expose standard rate-limit headers where practical."
    }),
    (ctx) => {
      const headerRecord = ctx.snapshot.records.find((item) => header(item, "ratelimit-limit") || header(item, "x-ratelimit-limit"));
      if (headerRecord) return finding(builtInRules[27], "pass", [evidence("Rate-limit header found.", headerRecord.url)]);
      if (anyText(ctx, ["rate limit", "rate-limit", "requests per second", "quota"])) return finding(builtInRules[27], "pass", [evidence("Rate-limit documentation text found.")]);
      return finding(builtInRules[27], "unknown", [evidence("No rate-limit guidance found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "agent.a2a_agent_card_detected",
      title: "A2A Agent Card is detectable",
      profiles: agentProfiles,
      category: "a2a",
      severity: "critical",
      description: "Checks for A2A Agent Card discovery paths.",
      recommendation: "Publish an A2A Agent Card at /.well-known/agent-card.json or document the direct card URL.",
      source: sourceUrl("a2a")
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/.well-known/agent-card.json", "/.well-known/agent.json"]);
      if (item) return finding(builtInRules[28], "pass", [evidence("A2A Agent Card found.", item.url)]);
      return finding(builtInRules[28], "fail", [evidence("No A2A Agent Card found at well-known paths.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "agent.a2a_agent_card_shape",
      title: "A2A Agent Card has usable fields",
      profiles: agentProfiles,
      category: "a2a",
      severity: "major",
      description: "Checks whether the Agent Card has basic identity and capability fields.",
      recommendation: "Include name, description, version, service URL or supported interfaces, and skills.",
      source: sourceUrl("a2a")
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/.well-known/agent-card.json", "/.well-known/agent.json"]);
      if (!item) return finding(builtInRules[29], "not_applicable", [evidence("No Agent Card was fetched.")]);
      try {
        const parsed = JSON.parse(item.body);
        const hasIdentity = typeof parsed.name === "string" && typeof parsed.description === "string";
        const hasEndpoint = typeof parsed.url === "string" || Array.isArray(parsed.supportedInterfaces);
        const hasSkills = Array.isArray(parsed.skills);
        if (hasIdentity && hasEndpoint && hasSkills) {
          return finding(builtInRules[29], "pass", [evidence("Agent Card includes identity, endpoint/interface, and skills.", item.url)]);
        }
        return finding(builtInRules[29], "warn", [evidence("Agent Card is JSON but lacks one or more expected fields.", item.url)]);
      } catch {
        return finding(builtInRules[29], "fail", [evidence("Agent Card endpoint did not return valid JSON.", item.url)]);
      }
    }
  ),
  defineRule(
    baseDefinition({
      id: "agent.task_interface_detected",
      title: "Task interface is detectable",
      profiles: agentProfiles,
      category: "agent-service",
      severity: "major",
      description: "Checks for task interface, skills, input/output modes, or task lifecycle signals.",
      recommendation: "Document task submission, input/output modes, status lifecycle, expected outputs, and error behavior."
    }),
    (ctx) => {
      if (anyText(ctx, ["task", "skills", "inputmodes", "outputmodes", "submitted", "working", "completed"])) {
        return finding(builtInRules[30], "pass", [evidence("Task interface signal found.")]);
      }
      return finding(builtInRules[30], "warn", [evidence("No task interface signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "agent.mcp_metadata_detected",
      title: "MCP metadata is detectable",
      profiles: mcpProfiles,
      category: "mcp",
      severity: "major",
      description: "Checks for MCP server metadata or documentation hints.",
      recommendation: "Document MCP endpoint, transport, authorization, tools, resources, and prompts.",
      source: sourceUrl("mcp")
    }),
    (ctx) => {
      const item = firstSuccessfulPath(ctx, ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]);
      if (item) return finding(builtInRules[31], "pass", [evidence("MCP-related OAuth metadata found.", item.url)]);
      if (anyText(ctx, ["model context protocol", "mcp server", "mcp endpoint", "streamable http"])) {
        return finding(builtInRules[31], "pass", [evidence("MCP documentation text found.")]);
      }
      return finding(builtInRules[31], "warn", [evidence("No MCP metadata or documentation signal found.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "mcp.oauth_protected_resource_metadata",
      title: "MCP OAuth protected resource metadata is available",
      profiles: mcpProfiles,
      category: "mcp",
      severity: "major",
      description: "Checks for RFC9728 OAuth protected resource metadata at the root well-known path.",
      recommendation: "For protected HTTP MCP servers, publish OAuth protected resource metadata or return resource_metadata in WWW-Authenticate.",
      source: sourceUrl("mcp")
    }),
    (ctx) => {
      const item = record(ctx, "/.well-known/oauth-protected-resource");
      if (item && successful(item)) return finding(builtInRules[32], "pass", [evidence("OAuth protected resource metadata found.", item.url)]);
      const wwwAuth = ctx.snapshot.records.find((entry) => header(entry, "www-authenticate")?.includes("resource_metadata"));
      if (wwwAuth) return finding(builtInRules[32], "pass", [evidence("WWW-Authenticate resource_metadata hint found.", wwwAuth.url)]);
      return finding(builtInRules[32], "unknown", [recordStatusEvidence(ctx, "/.well-known/oauth-protected-resource")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.https_required",
      title: "Target uses HTTPS",
      profiles: allProfiles,
      category: "security",
      severity: "major",
      description: "Checks whether the normalized target uses HTTPS.",
      recommendation: "Use HTTPS for public agent, API, commerce, and policy surfaces."
    }),
    (ctx) => {
      if (ctx.snapshot.normalizedTarget.startsWith("https://")) {
        return finding(builtInRules[33], "pass", [evidence("Target uses HTTPS.", ctx.snapshot.normalizedTarget)]);
      }
      return finding(builtInRules[33], "warn", [evidence("Target uses HTTP, not HTTPS.", ctx.snapshot.normalizedTarget)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.security_txt",
      title: "security.txt is available",
      profiles: allProfiles,
      category: "security",
      severity: "minor",
      description: "Checks for /.well-known/security.txt.",
      recommendation: "Publish security.txt with vulnerability reporting contact information."
    }),
    (ctx) => {
      const item = record(ctx, "/.well-known/security.txt");
      if (item && successful(item)) return finding(builtInRules[34], "pass", [evidence("security.txt found.", item.url)]);
      return finding(builtInRules[34], "warn", [safeMissingEvidence("/.well-known/security.txt", item)]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.exposed_secret_passive_scan",
      title: "No obvious secrets found in fetched public content",
      profiles: allProfiles,
      category: "security",
      severity: "critical",
      description: "Passively scans fetched public text for common secret patterns.",
      recommendation: "Remove public secrets immediately, rotate affected credentials, and add secret scanning to CI."
    }),
    (ctx) => {
      const matches = securityRegexes().flatMap((pattern) => regexEvidence(ctx, pattern, "Secret-like token pattern found in public content."));
      if (matches.length > 0) return finding(builtInRules[35], "fail", matches);
      return finding(builtInRules[35], "pass", [evidence("No common secret patterns found in fetched public content.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.unsafe_cors",
      title: "CORS headers are not obviously unsafe",
      profiles: allProfiles,
      category: "security",
      severity: "critical",
      description: "Checks for wildcard CORS combined with credentials.",
      recommendation: "Avoid Access-Control-Allow-Origin: * with credentialed responses. Restrict allowed origins."
    }),
    (ctx) => {
      if (hasCorsWildcardWithCredentials(ctx)) {
        return finding(builtInRules[36], "fail", [evidence("Wildcard CORS with credentials detected.")]);
      }
      if (hasCorsWildcard(ctx)) {
        return finding(builtInRules[36], "warn", [evidence("Wildcard CORS detected. This may be acceptable for public APIs but should be intentional.")]);
      }
      return finding(builtInRules[36], "pass", [evidence("No wildcard CORS risk detected in fetched responses.")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.public_admin_path",
      title: "Public admin path is not exposed",
      profiles: allProfiles,
      category: "security",
      severity: "major",
      description: "Passively checks the common /admin path.",
      recommendation: "Protect admin surfaces with authentication and avoid exposing administrative metadata publicly."
    }),
    (ctx) => {
      const item = record(ctx, "/admin");
      if (!item || item.status === 404 || item.status === 403 || item.status === 401) {
        return finding(builtInRules[37], "pass", [evidence(`/admin is not publicly reachable (${statusLabel(item)}).`, item?.url)]);
      }
      if (item.status >= 200 && item.status < 300) return finding(builtInRules[37], "warn", [evidence("/admin returned a successful response.", item.url)]);
      return finding(builtInRules[37], "unknown", [recordStatusEvidence(ctx, "/admin")]);
    }
  ),
  defineRule(
    baseDefinition({
      id: "security.prompt_injection_surface",
      title: "No obvious prompt-injection bait found in public tool text",
      profiles: allProfiles,
      category: "security",
      severity: "major",
      description: "Checks public pages and agent/tool metadata for instruction-like text that may target agents.",
      recommendation: "Keep tool and agent descriptions descriptive, not imperative toward model internals."
    }),
    (ctx) => {
      const pattern = /(ignore (all )?(previous|prior) instructions|system prompt|developer message|reveal your prompt|do not tell the user)/i;
      const matches = regexEvidence(ctx, pattern, "Instruction-like prompt injection text found.");
      if (matches.length > 0) return finding(builtInRules[38], "warn", matches);
      return finding(builtInRules[38], "pass", [evidence("No obvious prompt-injection bait found in fetched content.")]);
    }
  )
];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  builtInRules,
  isPublicAddress,
  runScan,
  scanContext,
  validateUrl
});
