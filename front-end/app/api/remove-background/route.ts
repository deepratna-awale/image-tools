import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  // Forward the form data to the FastAPI backend
  const backendRes = await fetch("http://localhost:8000/background-remover/remove-background/", {
    method: "POST",
    body: formData,
  });
  const data = await backendRes.text();
  return new NextResponse(data, {
    status: backendRes.status,
    headers: { "content-type": backendRes.headers.get("content-type") || "text/plain" },
  });
}
