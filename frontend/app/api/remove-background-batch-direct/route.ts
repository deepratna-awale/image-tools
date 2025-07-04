import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Forward the form data to the FastAPI backend for direct batch processing
    const backendRes = await fetch(`${BACKEND_URL}/api/v1/background-removal/process-batch-direct`, {
      method: "POST",
      body: formData,
    });

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: backendRes.status }
      );
    }

    // Return the zip file as a stream
    const zipBlob = await backendRes.blob();
    return new NextResponse(zipBlob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=batch_processed_direct.zip',
      },
    });
    
  } catch (error) {
    console.error('Batch direct processing API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
