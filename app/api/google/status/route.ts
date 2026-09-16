import { hasGoogleDrive } from '@/lib/google-drive-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(await hasGoogleDrive(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '无法读取连接状态' },
      { status: 401 },
    );
  }
}

