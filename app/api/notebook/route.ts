import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/lib/db';
import { emptyNotebook, validateNotebook } from '@/lib/model';
export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: '请先登录后读取数据' }, 401);
  try {
    const db = database(),
      prev = new URL(request.url).searchParams.get('revision');
    if (prev !== null) {
      const n = Number(prev);
      if (!Number.isSafeInteger(n) || n < 0)
        return response({ error: '版本无效' }, 400);
      const row = await db
        .prepare(
          'SELECT data FROM notebook_history WHERE owner = ? AND revision = ?',
        )
        .bind(user.userId, n)
        .first<{ data: string }>();
      return row
        ? response({ data: JSON.parse(row.data) })
        : response({ error: '没有可恢复的历史版本' }, 404);
    }
    await db
      .prepare(
        'INSERT OR IGNORE INTO notebooks (owner,revision,data,updated_at) VALUES (?,0,?,?)',
      )
      .bind(
        user.userId,
        JSON.stringify(emptyNotebook()),
        new Date().toISOString(),
      )
      .run();
    const row = await db
      .prepare('SELECT revision,data,updated_at FROM notebooks WHERE owner = ?')
      .bind(user.userId)
      .first<{ revision: number; data: string; updated_at: string }>();
    return response({
      data: JSON.parse(row!.data),
      revision: row!.revision,
      updatedAt: row!.updated_at,
    });
  } catch {
    return response({ error: '暂时无法读取云端数据，请稍后重试。' }, 503);
  }
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: '请先登录后保存数据' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return response({ error: '请求来源无效' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 3_000_000)
      return response(
        { error: '数据超过单次保存限制，请先导出备份并拆分项目。' },
        413,
      );
    const body = JSON.parse(raw);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      return response({ error: '版本无效' }, 400);
    const data = validateNotebook(body.data),
      serialized = JSON.stringify(data),
      now = new Date().toISOString(),
      db = database();
    const results = await db.batch([
      db
        .prepare(
          'INSERT OR IGNORE INTO notebook_history (owner,revision,data,saved_at) SELECT owner,revision,data,? FROM notebooks WHERE owner = ? AND revision = ?',
        )
        .bind(now, user.userId, body.revision),
      db
        .prepare(
          'UPDATE notebooks SET data = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?',
        )
        .bind(serialized, now, user.userId, body.revision),
    ]);
    if (results[1].meta.changes !== 1)
      return response(
        {
          error:
            '另一台设备已更新数据。请先备份当前内容，再点击重新读取后重试。',
        },
        409,
      );
    return response({ revision: body.revision + 1, updatedAt: now });
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : '保存失败，请重试' },
      400,
    );
  }
}

