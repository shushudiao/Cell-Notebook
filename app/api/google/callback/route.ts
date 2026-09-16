import { getChatGPTUser } from '@/app/chatgpt-auth';
import { exchangeCode, saveRefreshToken } from '@/lib/google-drive-server';
export const dynamic = 'force-dynamic';
const redirectHome = (request: Request, value: string) =>
  Response.redirect(`${new URL(request.url).origin}/?google=${value}`);
export async function GET(request: Request) {
  if (!(await getChatGPTUser())) return redirectHome(request, 'login_required');
  const url = new URL(request.url),
    code = url.searchParams.get('code'),
    state = url.searchParams.get('state'),
    cookie = request.headers
      .get('cookie')
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('google_oauth_state='))
      ?.slice('google_oauth_state='.length);
  if (!code || !state || !cookie || state !== cookie)
    return redirectHome(request, 'invalid_state');
  try {
    await saveRefreshToken(await exchangeCode(request, code));
    const response = redirectHome(request, 'connected');
    response.headers.append(
      'Set-Cookie',
      'google_oauth_state=; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    );
    return response;
  } catch {
    return redirectHome(request, 'failed');
  }
}

