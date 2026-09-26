CREATE TABLE `dns_blocked_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`block_all` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dns_blocked_devices_device_id_unique` ON `dns_blocked_devices` (`device_id`);--> statement-breakpoint
CREATE TABLE `dns_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`action` text DEFAULT 'block' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`category` text DEFAULT 'custom' NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dns_rules_domain_unique` ON `dns_rules` (`domain`);--> statement-breakpoint
CREATE INDEX `dns_rules_domain_idx` ON `dns_rules` (`domain`);