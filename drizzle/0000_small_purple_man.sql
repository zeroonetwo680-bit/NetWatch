CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`mac_address` text NOT NULL,
	`ip_address` text,
	`hostname` text,
	`user_id` integer,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_mac_address_unique` ON `devices` (`mac_address`);--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE INDEX `devices_status_idx` ON `devices` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `speed_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`download_mbps` real NOT NULL,
	`upload_mbps` real NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`applied_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speed_limits_device_id_unique` ON `speed_limits` (`device_id`);--> statement-breakpoint
CREATE TABLE `traffic_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`download_bytes` integer NOT NULL,
	`upload_bytes` integer NOT NULL,
	`download_bps` real,
	`upload_bps` real,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `samples_device_time_idx` ON `traffic_samples` (`device_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `samples_time_idx` ON `traffic_samples` (`timestamp`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`date` text NOT NULL,
	`download_bytes` integer DEFAULT 0 NOT NULL,
	`upload_bytes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_daily_device_date_uq` ON `usage_daily` (`device_id`,`date`);--> statement-breakpoint
CREATE TABLE `usage_monthly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`download_bytes` integer DEFAULT 0 NOT NULL,
	`upload_bytes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_monthly_device_ym_uq` ON `usage_monthly` (`device_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);