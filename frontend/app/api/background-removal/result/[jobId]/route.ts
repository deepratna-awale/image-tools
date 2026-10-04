import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    const backendRes = await fetch(`${BACKEND_URL}/api/v1/background-removal/result/${jobId}`);
    
    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json(
        { error: `Backend error: ${errorText}` },
        { status: backendRes.status }
      );
    }

    // Return the image as a stream
    const imageBlob = await backendRes.blob();
    return new NextResponse(imageBlob, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename=processed_${jobId}.png`,
      },
    });
    
  } catch (error) {
    console.error('Result API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
