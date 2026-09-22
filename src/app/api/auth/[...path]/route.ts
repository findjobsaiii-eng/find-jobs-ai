import { resolveConvexSiteUrl } from "@/lib/convex-site-url";
import {
  isAllowedOAuthProxyPath,
  normalizeFirstPartyOAuthCookie,
} from "@/lib/auth-oauth-proxy";

export const dynamic = "force-dynamic";

function forwardedHeaders(request: Request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "cookie", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!isAllowedOAuthProxyPath(path)) {
    return new Response("Not found", { status: 404 });
  }

  const convexSiteUrl = resolveConvexSiteUrl(
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.NEXT_PUBLIC_CONVEX_URL,
  );
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `/api/auth/${path.join("/")}${requestUrl.search}`,
    convexSiteUrl,
  );
  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: forwardedHeaders(request),
    redirect: "manual",
    cache: "no-store",
  });

  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", normalizeFirstPartyOAuthCookie(cookie));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
