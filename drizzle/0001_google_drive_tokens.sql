CREATE TABLE `google_drive_tokens` (
	`owner` text PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`updated_at` text NOT NULL
);

