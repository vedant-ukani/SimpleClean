ALTER TABLE "inventory_machine" ADD COLUMN "capacity_lb" integer;
--> statement-breakpoint
ALTER TABLE "inventory_machine" ADD CONSTRAINT "inventory_machine_capacity_check" CHECK ("capacity_lb" is null or ("capacity_lb" > 0 and "capacity_lb" <= 2000));
--> statement-breakpoint
ALTER TABLE "machine_identity_evidence" ADD COLUMN "capacity_lb" integer;
--> statement-breakpoint
ALTER TABLE "machine_identity_evidence" ADD CONSTRAINT "machine_identity_evidence_capacity_check" CHECK ("capacity_lb" is null or ("capacity_lb" > 0 and "capacity_lb" <= 2000));
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD COLUMN "capacity_lb" integer;
--> statement-breakpoint
ALTER TABLE "inventory_intake_candidate" ADD CONSTRAINT "inventory_intake_candidate_capacity_check" CHECK ("capacity_lb" is null or ("capacity_lb" > 0 and "capacity_lb" <= 2000));
