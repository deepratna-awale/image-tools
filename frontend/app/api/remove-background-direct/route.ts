import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Forward the form data to the FastAPI backend for direct processing
    const backendRes = await fetch(`${BACKEND_URL}/api/v1/background-removal/process-direct`, {
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

    // Return the processed image directly
    const imageBlob = await backendRes.blob();
    return new NextResponse(imageBlob, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename=processed_direct.png',
      },
    });
    
  } catch (error) {
    console.error('Direct processing API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
