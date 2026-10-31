import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** The caller's address: Caddy sets X-Client-Ip, overwriting anything the caller sent */
function clientIp(req: NextRequest) {
  const fromCaddy = req.headers.get("x-client-ip");
  if (fromCaddy) return fromCaddy.trim();
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

/** Forward a self-serve API key call (sign up, check or revoke your own key) to the backend */
export async function forward(req: NextRequest, path: string, method: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Client-Ip": clientIp(req) };
  for (const name of ["x-api-key", "authorization"]) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/v1/api-keys${path}`, {
      method,
      headers,
      body: method === "POST" ? await req.text() : undefined,
      cache: "no-store",
    });
    const out: Record<string, string> = { "Cache-Control": "no-store", "Content-Type": "application/json" };
    const retryAfter = backendRes.headers.get("retry-after");
    if (retryAfter) out["Retry-After"] = retryAfter;
    return new NextResponse(await backendRes.text(), { status: backendRes.status, headers: out });
  } catch (error) {
    console.error("API key sign-up route error:", error);
    return NextResponse.json({ detail: "Could not reach the API" }, { status: 502 });
  }
}
