CREATE TABLE `work_revisions` (
 `owner_id` text NOT NULL,
 `project_id` text NOT NULL,
 `revision` integer NOT NULL,
 `request_id` text NOT NULL,
 `payload` text NOT NULL,
 `created_at` text NOT NULL,
 PRIMARY KEY(`owner_id`, `project_id`, `revision`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_revision_request` ON `work_revisions` (`owner_id`, `request_id`);
