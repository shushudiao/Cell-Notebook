import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/lib/db';
import { Notebook, validateNotebook } from '@/lib/model';
import { googleDriveErrorMessage } from '@/lib/drive';

const scope = 'https://www.googleapis.com/auth/drive.appdata';

type GoogleEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
};

function config() {
  const values = env as unknown as GoogleEnv;
  if (
    !values.GOOGLE_CLIENT_ID ||
    !values.GOOGLE_CLIENT_SECRET ||
    !values.GOOGLE_TOKEN_ENCRYPTION_KEY
  )
    throw new Error('Google Drive 持续连接尚未完成服务器配置');
  return {
    clientId: values.GOOGLE_CLIENT_ID,
    clientSecret: values.GOOGLE_CLIENT_SECRET,
    encryptionKey: values.GOOGLE_TOKEN_ENCRYPTION_KEY,
  };
}

const bytes = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
const encoded = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function cryptoKey() {
  const key = bytes(config().encryptionKey);
  if (key.length !== 32) throw new Error('Google 令牌加密密钥配置无效');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cryptoKey(),
    new TextEncoder().encode(token),
  );
  return `${encoded(iv)}.${encoded(new Uint8Array(cipher))}`;
}

async function decryptToken(value: string) {
  const [iv, cipher] = value.split('.');
  if (!iv || !cipher) throw new Error('Google 授权记录无效');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(iv) },
    await cryptoKey(),
    bytes(cipher),
  );
  return new TextDecoder().decode(clear);
}

export function googleRedirectUri(request: Request) {
  return `${new URL(request.url).origin}/api/google/callback`;
}

export function googleAuthorizationUrl(request: Request, state: string) {
  const { clientId } = config();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(request),
    response_type: 'code',
    scope,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  }).toString();
  return url.toString();
}

export async function exchangeCode(request: Request, code: string) {
  const { clientId, clientSecret } = config();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(request),
      grant_type: 'authorization_code',
    }),
  });
  const body = (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !body.refresh_token)
    throw new Error(body.error_description || 'Google 未返回长期授权，请重试');
  return body.refresh_token;
}

async function currentOwner() {
  const user = await getChatGPTUser();
  if (!user) throw new Error('请先登录后连接 Google Drive');
  return user.userId;
}

export async function hasGoogleDrive() {
  try {
    config();
  } catch {
    return { configured: false, connected: false };
  }
  const owner = await currentOwner();
  const row = await database()
    .prepare('SELECT owner FROM google_drive_tokens WHERE owner = ?')
    .bind(owner)
    .first();
  return { configured: true, connected: Boolean(row) };
}

export async function saveRefreshToken(refreshToken: string) {
  const owner = await currentOwner();
  const encrypted = await encryptToken(refreshToken);
  await database()
    .prepare(
      'INSERT INTO google_drive_tokens (owner,refresh_token,updated_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=excluded.updated_at',
    )
    .bind(owner, encrypted, new Date().toISOString())
    .run();
}

export async function disconnectGoogleDrive() {
  const owner = await currentOwner();
  await database()
    .prepare('DELETE FROM google_drive_tokens WHERE owner = ?')
    .bind(owner)
    .run();
}

async function accessToken() {
  const owner = await currentOwner();
  const row = await database()
    .prepare('SELECT refresh_token FROM google_drive_tokens WHERE owner = ?')
    .bind(owner)
    .first<{ refresh_token: string }>();
  if (!row) throw new Error('请先连接 Google Drive');
  const { clientId, clientSecret } = config();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: await decryptToken(row.refresh_token),
      grant_type: 'refresh_token',
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    if (body.error === 'invalid_grant') await disconnectGoogleDrive();
    throw new Error(
      body.error === 'invalid_grant'
        ? 'Google 授权已失效，请重新连接一次'
        : body.error_description || '暂时无法刷新 Google 授权',
    );
  }
  return body.access_token;
}

async function driveFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await accessToken()}`,
    },
  });
  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {}
    throw new Error(googleDriveErrorMessage(response.status, details));
  }
  return response;
}

export type ServerDriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
};

export async function listServerDrive() {
  const query = encodeURIComponent(
    "trashed = false and name contains 'CellNotebook-'",
  );
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50`,
  );
  return ((await response.json()) as { files: ServerDriveFile[] }).files;
}

export async function backupServerDrive(data: Notebook) {
  const stamp = new Date().toISOString();
  const metadata = {
    name: `CellNotebook-${stamp}.json`,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  };
  const boundary = `cell-notebook-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ app: 'CellNotebook', exportedAt: stamp, data })}\r\n`,
    `--${boundary}--`,
  ].join('');
  await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function readServerDrive(id: string) {
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
  );
  const raw = await response.text();
  if (raw.length > 3_000_000) throw new Error('备份过大，无法导入');
  const json = JSON.parse(raw);
  return validateNotebook(json.data ?? json);
}

