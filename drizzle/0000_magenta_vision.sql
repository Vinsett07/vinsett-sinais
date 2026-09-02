CREATE TABLE `assets` (
	`code` text PRIMARY KEY NOT NULL,
	`pair` text NOT NULL,
	`coinbase` text NOT NULL,
	`kraken` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`requester` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`acknowledged_at` integer,
	`reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commands_requester_key` ON `commands` (`requester`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_commands_status_time` ON `commands` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `public_status` (
	`asset` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`synced_at` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `assets`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` integer PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`asset` text NOT NULL,
	`revision` integer NOT NULL,
	`record_version` integer NOT NULL,
	`strategy_version` text NOT NULL,
	`direction` text NOT NULL,
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`entry_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	`analyzed_at` integer,
	`published_at` integer,
	`assessed_at` integer,
	`result` text NOT NULL,
	`state` text NOT NULL,
	`publication` text NOT NULL,
	`valid_result` integer NOT NULL,
	`demo` integer NOT NULL,
	`score` real,
	`data` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `assets`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_signals_asset_entry` ON `signals` (`asset`,`entry_at`);--> statement-breakpoint
CREATE INDEX `idx_signals_entry_id` ON `signals` (`entry_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_signals_asset_entry_id` ON `signals` (`asset`,`entry_at`,`id`);