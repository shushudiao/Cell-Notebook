import { Notebook, validateNotebook } from './model';
type Token = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  scope?: string;
};
type GoogleAPI = {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: Token) => void;
        error_callback: (e: { type: string }) => void;
      }) => { requestAccessToken: (o: { prompt: string }) => void };
      hasGrantedAllScopes: (r: Token, ...scopes: string[]) => boolean;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleAPI;
  }
}
const scope = 'https://www.googleapis.com/auth/drive.appdata';
let token = '',
  expires = 0;
export function loadGoogle() {
  return new Promise<void>((resolve, reject) => {
    if (window.google) {
      resolve();
      return;
    }
    const old = document.querySelector('script[data-cell-google]');
    if (old) old.remove();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.dataset.cellGoogle = 'true';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Google 授权服务未能加载，请检查网络。'));
    document.head.appendChild(script);
  });
}
export function connectDrive(clientId: string) {
  return new Promise<void>((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google 登录服务尚未加载，请稍后再点连接。'));
      return;
    }
    if (!clientId.trim().endsWith('.apps.googleusercontent.com')) {
      reject(new Error('请先填写 Google OAuth 网页客户端 ID。'));
      return;
    }
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: clientId.trim(),
        scope,
        callback: (r) => {
          if (
            r.error ||
            !r.access_token ||
            !window.google!.accounts.oauth2.hasGrantedAllScopes(r, scope)
          ) {
            reject(new Error('未获得备份目录权限，请重新连接。'));
            return;
          }
          token = r.access_token;
          expires = Date.now() + (r.expires_in ?? 3600) * 1000;
          resolve();
        },
        error_callback: () =>
          reject(new Error('授权窗口已关闭或被浏览器拦截。')),
      })
      .requestAccessToken({ prompt: 'select_account' });
  });
}
export function disconnectDrive() {
  token = '';
  expires = 0;
}
async function driveFetch(path: string, options: RequestInit = {}) {
  if (!token || Date.now() >= expires)
    throw new Error('Google 授权已过期，请重新连接。');
  const r = await fetch(path, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    if (r.status === 401) disconnectDrive();
    let details: unknown;
    try {
      details = await r.json();
    } catch {
      details = null;
    }
    throw new Error(googleDriveErrorMessage(r.status, details));
  }
  return r;
}

type GoogleErrorBody = {
  error?: {
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
    details?: Array<{ reason?: string }>;
  };
};

export function googleDriveErrorMessage(status: number, body: unknown) {
  const error = (body as GoogleErrorBody | null)?.error;
  const reason =
    error?.errors?.[0]?.reason ?? error?.details?.[0]?.reason ?? error?.status;
  const message = error?.message;

  if (
    status === 403 &&
    (reason === 'accessNotConfigured' ||
      reason === 'SERVICE_DISABLED' ||
      message?.includes('has not been used in project') ||
      message?.includes('is disabled'))
  ) {
    return 'Google Drive API 尚未在这个客户端 ID 所属的 Cloud 项目中启用。请在同一项目启用 Google Drive API，等待设置生效后断开并重新连接。';
  }
  if (
    status === 403 &&
    (reason === 'insufficientPermissions' ||
      reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
  ) {
    return 'Google 没有授予应用备份目录权限。请在 OAuth 同意页面加入 drive.appdata 权限，然后断开并重新连接。';
  }
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return 'Google Drive 存储空间已满，清理空间后再保存备份。';
  }
  if (status === 401) {
    return 'Google 授权已失效，请重新连接 Google Drive。';
  }

  const suffix = [reason, message]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(' · ');
  return `Google Drive 请求失败（${status}）${suffix ? `：${suffix}` : '，请检查 Drive API、授权范围和账号策略。'}`;
}
export type DriveFile = { id: string; name: string; modifiedTime: string };
export async function listDrive() {
  const q = encodeURIComponent(
    "trashed = false and name contains 'CellNotebook-'",
  );
  const r = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50`,
  );
  return ((await r.json()) as { files: DriveFile[] }).files;
}
export async function backupDrive(data: Notebook) {
  const stamp = new Date().toISOString();
  const metadata = {
    name: `CellNotebook-${stamp}.json`,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  };
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append(
    'file',
    new Blob(
      [JSON.stringify({ app: 'CellNotebook', exportedAt: stamp, data })],
      { type: 'application/json' },
    ),
  );
  await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', body: form },
  );
}
export async function readDrive(id: string) {
  const r = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
  );
  const raw = await r.text();
  if (raw.length > 3_000_000) throw new Error('备份过大，无法导入。');
  const json = JSON.parse(raw);
  return validateNotebook(json.data ?? json);
}

