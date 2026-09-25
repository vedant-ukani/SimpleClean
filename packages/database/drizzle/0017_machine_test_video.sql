ALTER TABLE file_attachment DROP CONSTRAINT file_attachment_purpose_check;--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_purpose_check CHECK (purpose IN ('nameplate', 'arrival_condition', 'document', 'receipt', 'other', 'intake_evidence', 'preliminary_inspection', 'production_test_evidence', 'production_test_video'));--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_production_video_target_check CHECK (purpose <> 'production_test_video' OR machine_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE file_attachment DROP CONSTRAINT file_attachment_declared_media_type_check;--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_declared_media_type_check CHECK (declared_media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm'));--> statement-breakpoint
ALTER TABLE file_attachment DROP CONSTRAINT file_attachment_detected_media_type_check;--> statement-breakpoint
ALTER TABLE file_attachment ADD CONSTRAINT file_attachment_detected_media_type_check CHECK (detected_media_type IS NULL OR detected_media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm'));--> statement-breakpoint
ALTER TABLE production_test_run ADD COLUMN video_file_id text REFERENCES file_attachment(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE production_test_run ADD CONSTRAINT production_test_run_video_unique UNIQUE (video_file_id);--> statement-breakpoint
