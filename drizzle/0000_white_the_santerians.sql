CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ebay_item_id` text NOT NULL,
	`title` text NOT NULL,
	`price` real NOT NULL,
	`currency` text NOT NULL,
	`sold_date` text NOT NULL,
	`keyword` text NOT NULL,
	`seller_username` text NOT NULL,
	`seller_feedback_score` integer NOT NULL,
	`shipping_price` real NOT NULL,
	`category_id` text NOT NULL,
	`category_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_listings_title` ON `listings` (`title`);--> statement-breakpoint
CREATE INDEX `idx_listings_seller` ON `listings` (`seller_username`);--> statement-breakpoint
CREATE INDEX `idx_listings_category` ON `listings` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_listings_sold_date` ON `listings` (`sold_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_ebay_item` ON `listings` (`ebay_item_id`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`sold_count_30d` integer NOT NULL,
	`avg_sold_price` real NOT NULL,
	`min_sold_price` real NOT NULL,
	`max_sold_price` real NOT NULL,
	`seller_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_keyword` ON `metrics` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_metrics_created_at` ON `metrics` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_keyword_created_at` ON `metrics` (`keyword`,`created_at`);--> statement-breakpoint
CREATE TABLE `scoring_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`demand_score` real NOT NULL,
	`competition_score` real NOT NULL,
	`profitability_score` real NOT NULL,
	`overall_score` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scoring_results_keyword` ON `scoring_results` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_scoring_results_overall_score` ON `scoring_results` (`overall_score`);--> statement-breakpoint
CREATE INDEX `idx_scoring_results_created_at` ON `scoring_results` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_scoring_keyword_created_at` ON `scoring_results` (`keyword`,`created_at`);