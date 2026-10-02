CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'CORRECTED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('ACTIVE', 'INACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."fingerprint_enrollment_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('WHATSAPP', 'EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."device_event_processing_status" AS ENUM('ACCEPTED', 'REJECTED_DAILY_LIMIT', 'REJECTED_VALIDATION', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."absence_run_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."sheet_sync_status" AS ENUM('PENDING', 'SYNCED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERATOR', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "absence_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "absence_run_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"previous_value" jsonb NOT NULL,
	"new_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_corrections_reason_nonempty" CHECK (length(trim("attendance_corrections"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"fingerprint_enrollment_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'PRESENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_event_id_nonempty" CHECK (length(trim("attendance_records"."event_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"credential_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "device_credentials_hash_nonempty" CHECK (length("device_credentials"."credential_hash") >= 32)
);
--> statement-breakpoint
CREATE TABLE "device_event_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" "device_event_processing_status" NOT NULL,
	"attendance_record_id" uuid,
	CONSTRAINT "device_event_receipts_event_id_nonempty" CHECK (length(trim("device_event_receipts"."event_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_identifier" text NOT NULL,
	"name" text NOT NULL,
	"status" "device_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_identifier_nonempty" CHECK (length(trim("devices"."device_identifier")) > 0)
);
--> statement-breakpoint
CREATE TABLE "fingerprint_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"fingerprint_id" integer NOT NULL,
	"slot_number" smallint NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "fingerprint_enrollment_status" DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "fingerprint_enrollments_id_range" CHECK ("fingerprint_enrollments"."fingerprint_id" between 1 and 127),
	CONSTRAINT "fingerprint_enrollments_slot_range" CHECK ("fingerprint_enrollments"."slot_number" between 1 and 2)
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "notification_status" NOT NULL,
	"provider_reference" text,
	"provider_response" jsonb,
	"error_code" text,
	"error_message" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_attempts_positive" CHECK ("notification_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_record_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"recipient" text NOT NULL,
	"message_type" text NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_recipient_nonempty" CHECK (length(trim("notifications"."recipient")) > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_attempts_nonnegative" CHECK ("outbox_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_nonempty" CHECK (length("sessions"."token_hash") >= 32)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "settings_key_nonempty" CHECK (length(trim("settings"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sheet_sync_state" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"last_synchronized_version" bigint,
	"last_synchronized_at" timestamp with time zone,
	"sync_status" "sheet_sync_status" DEFAULT 'PENDING' NOT NULL,
	"error_code" text,
	"error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"mobile_number" text NOT NULL,
	"status" "student_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_id_nonempty" CHECK (length(trim("students"."student_id")) > 0),
	CONSTRAINT "students_name_nonempty" CHECK (length(trim("students"."name")) > 0),
	CONSTRAINT "students_mobile_e164" CHECK (
    length("students"."mobile_number") between 9 and 16
    and left("students"."mobile_number", 1) = '+'
    and substring("students"."mobile_number" from 2 for 1) between '1' and '9'
    and translate(substring("students"."mobile_number" from 2), '0123456789', '') = ''
  )
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_password_hash_nonempty" CHECK (length("users"."password_hash") >= 32)
);
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_fingerprint_enrollment_id_fingerprint_enrollments_id_fk" FOREIGN KEY ("fingerprint_enrollment_id") REFERENCES "public"."fingerprint_enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD CONSTRAINT "device_event_receipts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD CONSTRAINT "device_event_receipts_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fingerprint_enrollments" ADD CONSTRAINT "fingerprint_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "absence_runs_date_uq" ON "absence_runs" USING btree ("attendance_date");--> statement-breakpoint
CREATE INDEX "absence_runs_status_idx" ON "absence_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "attendance_corrections_record_created_idx" ON "attendance_corrections" USING btree ("attendance_record_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_student_date_idx" ON "attendance_records" USING btree ("student_id","attendance_date","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_device_date_idx" ON "attendance_records" USING btree ("device_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_fingerprint_idx" ON "attendance_records" USING btree ("fingerprint_enrollment_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_created_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "device_credentials_device_active_idx" ON "device_credentials" USING btree ("device_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_event_receipts_device_event_uq" ON "device_event_receipts" USING btree ("device_id","event_id");--> statement-breakpoint
CREATE INDEX "device_event_receipts_attendance_idx" ON "device_event_receipts" USING btree ("attendance_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_device_identifier_uq" ON "devices" USING btree ("device_identifier");--> statement-breakpoint
CREATE INDEX "devices_status_last_seen_idx" ON "devices" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fingerprint_enrollments_fingerprint_id_uq" ON "fingerprint_enrollments" USING btree ("fingerprint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fingerprint_enrollments_student_slot_uq" ON "fingerprint_enrollments" USING btree ("student_id","slot_number");--> statement-breakpoint
CREATE INDEX "fingerprint_enrollments_student_status_idx" ON "fingerprint_enrollments" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_notification_attempt_uq" ON "notification_attempts" USING btree ("notification_id","attempt_number");--> statement-breakpoint
CREATE INDEX "notification_attempts_attempted_idx" ON "notification_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "notifications_status_created_idx" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_student_idx" ON "notifications" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_jobs_dispatch_idx" ON "outbox_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_jobs_aggregate_idx" ON "outbox_jobs" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_sync_state_entity_uq" ON "sheet_sync_state" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sheet_sync_state_status_idx" ON "sheet_sync_state" USING btree ("sync_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "students_student_id_uq" ON "students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_status_idx" ON "users" USING btree ("role","status");