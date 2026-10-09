import { NextRequest } from "next/server";
import { forward } from "../proxy";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const { keyId } = await params;
  return forward(req, `/${encodeURIComponent(keyId)}`, "DELETE");
}
