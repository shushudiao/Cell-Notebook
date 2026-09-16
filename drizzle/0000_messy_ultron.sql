CREATE TABLE `notebook_history` (
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`owner`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);

