import { getChatGPTUser } from '@/app/chatgpt-auth';
import { googleAuthorizationUrl } from '@/lib/google-drive-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!(await getChatGPTUser()))
    return Response.json({ error: '请先登录' }, { status: 401 });
  try {
    const state = crypto.randomUUID();
    const response = Response.redirect(googleAuthorizationUrl(request, state));
    response.headers.append(
      'Set-Cookie',
      `google_oauth_state=${state}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Google 配置无效' },
      { status: 503 },
    );
  }
}

