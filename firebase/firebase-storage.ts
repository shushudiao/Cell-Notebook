import { emptyNotebook, type Notebook } from '../lib/model';
import type {
  NotebookLoadResult,
  NotebookSaveResult,
  NotebookStorage,
} from '../lib/notebook-storage';

type Firestore = any;

const MAX_DATA_BYTES = 900_000;

function parseNotebook(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('云端记录格式不正确');
  }
}

function serialized(data: Notebook) {
  const value = JSON.stringify(data);
  if (new Blob([value]).size > MAX_DATA_BYTES) {
    throw new Error('记录已接近 Firebase 单条记录上限，请下载 JSON 备份后精简旧记录');
  }
  return value;
}

export function createFirestoreStorage(
  db: Firestore,
  uid: string,
): NotebookStorage {
  const main = db.doc(`users/${uid}/notebooks/main`);
  const history = db.collection(`users/${uid}/notebook_history`);

  return {
    async load(): Promise<NotebookLoadResult> {
      const snapshot = await main.get();
      if (!snapshot.exists) {
        return { data: emptyNotebook(), revision: 0, updatedAt: '' };
      }
      const record = snapshot.data() ?? {};
      return {
        data: parseNotebook(record.data),
        revision: Number(record.revision) || 0,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      };
    },

    async save(data: Notebook, revision: number): Promise<NotebookSaveResult> {
      const value = serialized(data);
      const updatedAt = new Date().toISOString();
      const nextRevision = await db.runTransaction(async (transaction: any) => {
        const snapshot = await transaction.get(main);
        const previous = snapshot.exists ? snapshot.data() ?? {} : {};
        const currentRevision = Number(previous.revision) || 0;
        if (currentRevision !== revision) {
          throw new Error('云端数据已在其他设备更新，请刷新后重试');
        }
        if (snapshot.exists && typeof previous.data === 'string') {
          transaction.set(history.doc(String(currentRevision)), {
            data: previous.data,
            revision: currentRevision,
            savedAt: updatedAt,
          });
        }
        const next = currentRevision + 1;
        transaction.set(main, { data: value, revision: next, updatedAt });
        return next;
      });
      return { revision: nextRevision, updatedAt };
    },

    async history(revision: number): Promise<unknown> {
      const snapshot = await history.doc(String(revision)).get();
      if (!snapshot.exists) throw new Error('找不到这个历史版本');
      return parseNotebook(snapshot.data()?.data);
    },
  };
}

