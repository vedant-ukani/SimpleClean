ALTER TABLE inventory_machine ADD COLUMN equipment_class text;--> statement-breakpoint
ALTER TABLE inventory_machine ADD CONSTRAINT inventory_machine_equipment_class_check CHECK (equipment_class IS NULL OR equipment_class IN ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other'));--> statement-breakpoint
ALTER TABLE machine_identity_evidence ADD COLUMN equipment_class text;--> statement-breakpoint
ALTER TABLE machine_identity_evidence ADD CONSTRAINT machine_identity_evidence_equipment_class_check CHECK (equipment_class IS NULL OR equipment_class IN ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other'));--> statement-breakpoint
ALTER TABLE inventory_intake_candidate ADD COLUMN equipment_class text;--> statement-breakpoint
ALTER TABLE inventory_intake_candidate ADD COLUMN equipment_class_selected_by_user_id text REFERENCES "user"(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE inventory_intake_candidate ADD COLUMN equipment_class_selected_at timestamptz;--> statement-breakpoint
ALTER TABLE inventory_intake_candidate ADD CONSTRAINT inventory_intake_candidate_equipment_class_check CHECK (equipment_class IS NULL OR equipment_class IN ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other'));--> statement-breakpoint
ALTER TABLE catalog_model_variant DROP CONSTRAINT catalog_model_variant_class_check;--> statement-breakpoint
ALTER TABLE catalog_model_variant ADD CONSTRAINT catalog_model_variant_class_check CHECK (equipment_class IN ('washer', 'dryer', 'stack_dryer', 'stacked_washer_dryer', 'washer_dryer_combo', 'other'));
