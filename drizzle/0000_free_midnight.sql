CREATE TABLE `saved_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`snapshot` text NOT NULL,
	`array_count` integer NOT NULL,
	`cell_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
