import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

// Backend tools this route may reach; everything else is a 404
const TOOLS = new Set(["background-changing", "sky-replacement", "metadata-reading", "ai-shield"]);

async function proxy(req: NextRequest, path: string[]) {
  if (!TOOLS.has(path[0])) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = `${BACKEND_URL}/api/v1/${path.map(encodeURIComponent).join("/")}`;
    const backendRes = await fetch(url, {
      method: req.method,
      body: req.method === "POST" ? await req.formData() : undefined,
    });

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      let message = errorText;
      try {
        message = JSON.parse(errorText).detail ?? errorText;
      } catch {
        // Not JSON; keep the raw text
      }
      return NextResponse.json({ error: message }, { status: backendRes.status });
    }

    const headers = new Headers();
    for (const name of ["content-type", "content-disposition"]) {
      const value = backendRes.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(backendRes.body, { status: backendRes.status, headers });
  } catch (error) {
    console.error('Tools API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(req, (await params).path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy(req, (await params).path);
}
