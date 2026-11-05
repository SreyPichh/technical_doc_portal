-- Revision integrity rules, enforced in the database so that no code path
-- (including future ones) can silently overwrite an official revision.
--
-- 1. Once a revision has been published, its file and identifying fields are
--    immutable. Status transitions (published -> superseded, etc.), notes and
--    OCR text may still change.
-- 2. A revision that has ever been published can never be deleted.
-- 3. Controlled administrative corrections are possible only by explicitly
--    setting `SET LOCAL app.revision_correction = 'on'` inside a transaction
--    (see src/server/services/revisions.ts → correctRevisionMetadata), which
--    is always paired with an activity-log entry.

CREATE OR REPLACE FUNCTION nsk_guard_revision_update() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL
     AND coalesce(current_setting('app.revision_correction', true), 'off') <> 'on' THEN
    IF NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.file_size IS DISTINCT FROM OLD.file_size
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.sequence IS DISTINCT FROM OLD.sequence
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.release_date IS DISTINCT FROM OLD.release_date
       OR NEW.authored_content IS DISTINCT FROM OLD.authored_content THEN
      RAISE EXCEPTION 'Published revision % is immutable (use the controlled correction procedure)', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_revisions_guard_update
  BEFORE UPDATE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION nsk_guard_revision_update();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nsk_guard_revision_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revision % has been published and cannot be deleted', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER document_revisions_guard_delete
  BEFORE DELETE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION nsk_guard_revision_delete();
--> statement-breakpoint
-- Activity logs are append-only.
CREATE OR REPLACE FUNCTION nsk_guard_activity_log() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER activity_logs_append_only
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION nsk_guard_activity_log();
--> statement-breakpoint
-- The current revision of a document must belong to that document and be published.
CREATE OR REPLACE FUNCTION nsk_check_current_revision() RETURNS trigger AS $$
DECLARE r record;
BEGIN
  IF NEW.current_revision_id IS NOT NULL THEN
    SELECT document_id, approval_status INTO r FROM document_revisions WHERE id = NEW.current_revision_id;
    IF r.document_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'current_revision_id must reference a revision of the same document' USING ERRCODE = 'check_violation';
    END IF;
    IF r.approval_status <> 'published' THEN
      RAISE EXCEPTION 'current_revision_id must reference a published revision' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER documents_current_revision_check
  AFTER INSERT OR UPDATE OF current_revision_id ON documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION nsk_check_current_revision();
