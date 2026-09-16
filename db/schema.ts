import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const notebooks = sqliteTable('notebooks', {
  owner: text('owner').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const notebookHistory = sqliteTable(
  'notebook_history',
  {
    owner: text('owner').notNull(),
    revision: integer('revision').notNull(),
    data: text('data').notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.revision] })],
);
export const googleDriveTokens = sqliteTable('google_drive_tokens', {
  owner: text('owner').primaryKey(),
  refreshToken: text('refresh_token').notNull(),
  updatedAt: text('updated_at').notNull(),
});

