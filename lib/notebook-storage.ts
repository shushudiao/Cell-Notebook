import type { Notebook } from './model';

export type NotebookLoadResult = {
  data: unknown;
  revision: number;
  updatedAt: string;
};

export type NotebookSaveResult = {
  revision: number;
  updatedAt: string;
};

export interface NotebookStorage {
  load(): Promise<NotebookLoadResult>;
  save(data: Notebook, revision: number): Promise<NotebookSaveResult>;
  history(revision: number): Promise<unknown>;
}

async function jsonResponse(response: Response) {
  const result = (await response.json()) as {
    error?: string;
    data?: unknown;
    revision?: number;
    updatedAt?: string;
  };
  if (!response.ok) throw new Error(result.error || '云端请求失败');
  return result;
}

export const apiNotebookStorage: NotebookStorage = {
  async load() {
    const result = await jsonResponse(
      await fetch('/api/notebook', { cache: 'no-store' }),
    );
    return {
      data: result.data,
      revision: result.revision ?? 0,
      updatedAt: result.updatedAt ?? '',
    };
  },
  async save(data, revision) {
    const result = await jsonResponse(
      await fetch('/api/notebook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, revision }),
      }),
    );
    return {
      revision: result.revision ?? revision + 1,
      updatedAt: result.updatedAt ?? new Date().toISOString(),
    };
  },
  async history(revision) {
    const result = await jsonResponse(
      await fetch(`/api/notebook?revision=${revision}`, {
        cache: 'no-store',
      }),
    );
    return result.data;
  },
};

