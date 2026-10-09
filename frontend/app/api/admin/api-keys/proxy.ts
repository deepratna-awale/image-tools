import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Forward an API key management call to the backend, which checks the admin token */
export async function forward(req: NextRequest, path: string, method: string) {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/v1/admin/api-keys${path}`, {
      method,
      headers: {
        Authorization: req.headers.get("authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: method === "POST" ? await req.text() : undefined,
      cache: "no-store",
    });
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    const retryAfter = backendRes.headers.get("retry-after");
    if (retryAfter) headers["Retry-After"] = retryAfter;
    return new NextResponse(await backendRes.text(), { status: backendRes.status, headers });
  } catch (error) {
    console.error("API keys route error:", error);
    return NextResponse.json({ detail: "Could not reach the API" }, { status: 502 });
  }
}
