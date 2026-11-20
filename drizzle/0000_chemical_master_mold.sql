CREATE TABLE `brand_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brand_kits_org` ON `brand_kits` (`org_id`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`media_id` text NOT NULL,
	`resolution` text NOT NULL,
	`fps` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exports_video` ON `exports` (`video_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`kit_id` text,
	`video_id` text,
	`purpose` text NOT NULL,
	`asset_kind` text,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_owner` ON `media` (`org_id`,`owner_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `media_kit` ON `media` (`kit_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`scene_id` text,
	`version_number` integer,
	`rating` text,
	`feedback` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_video` ON `messages` (`video_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`shared` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_org` ON `projects` (`org_id`);--> statement-breakpoint
CREATE TABLE `saved_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`scene` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_scenes_org` ON `saved_scenes` (`org_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`number` integer NOT NULL,
	`draft` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `versions_video` ON `versions` (`video_id`,`number`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`aspect` text NOT NULL,
	`quality` text NOT NULL,
	`length_seconds` integer NOT NULL,
	`kit` text,
	`draft` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published` text,
	`published_revision` integer,
	`share_mode` text DEFAULT 'private' NOT NULL,
	`preview_media_id` text,
	`preview_time` real,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `videos_org` ON `videos` (`org_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`admin_only_saved_scenes` integer DEFAULT false NOT NULL
);
