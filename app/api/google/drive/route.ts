import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  backupServerDrive,
  disconnectGoogleDrive,
  listServerDrive,
  readServerDrive,
} from '@/lib/google-drive-server';
import { validateNotebook } from '@/lib/model';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorized() {
  return Boolean(await getChatGPTUser());
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
export async function GET(request: Request) {
  if (!(await authorized())) return json({ error: '请先登录' }, 401);
  try {
    const id = new URL(request.url).searchParams.get('id');
    return id
      ? json({ data: await readServerDrive(id) })
      : json({ files: await listServerDrive() });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
}
export async function POST(request: Request) {
  if (!(await authorized())) return json({ error: '请先登录' }, 401);
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 3_000_000) return json({ error: '备份超过 3 MB' }, 413);
    await backupServerDrive(validateNotebook(JSON.parse(raw).data));
    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
}
export async function DELETE(request: Request) {
  if (!(await authorized())) return json({ error: '请先登录' }, 401);
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  try {
    await disconnectGoogleDrive();
    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
}

