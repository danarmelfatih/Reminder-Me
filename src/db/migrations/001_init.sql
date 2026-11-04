CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  avatar_path text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified_at timestamptz,
  google_id text,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  storage_quota_bytes bigint NOT NULL DEFAULT 1073741824 CHECK (storage_quota_bytes > 0),
  storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  folder_limit integer NOT NULL DEFAULT 50 CHECK (folder_limit > 0),
  tag_limit integer NOT NULL DEFAULT 100 CHECK (tag_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (lower(email));
CREATE UNIQUE INDEX users_google_id_uidx ON users (google_id) WHERE google_id IS NOT NULL;

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  remember boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_user_type_idx ON auth_tokens (user_id, type);

CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX folders_user_name_uidx ON folders (user_id, lower(name));

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tags_user_name_uidx ON tags (user_id, lower(name));

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('link', 'text', 'image', 'document')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text,
  url text,
  domain text,
  link_metadata jsonb,
  og_image_path text,
  favicon_path text,
  custom_thumbnail_path text,
  file_path text,
  file_name text,
  file_mime text,
  file_ext text,
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  thumbnail_path text,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_favorite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  trash_warning_sent_at timestamptz,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_type_fields CHECK (
    (type = 'link' AND url IS NOT NULL AND file_path IS NULL) OR
    (type = 'text' AND url IS NULL AND file_path IS NULL) OR
    (type IN ('image', 'document') AND url IS NULL AND file_path IS NOT NULL)
  )
);

CREATE INDEX items_user_list_idx ON items (user_id, deleted_at, is_archived, created_at DESC);
CREATE INDEX items_user_folder_idx ON items (user_id, folder_id);
CREATE INDEX items_user_type_idx ON items (user_id, type);
CREATE INDEX items_user_favorite_idx ON items (user_id, is_favorite) WHERE deleted_at IS NULL;
CREATE INDEX items_trash_idx ON items (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX items_priority_idx ON items (user_id, priority);
CREATE INDEX items_search_gin_idx ON items USING gin (search_vector);
CREATE INDEX items_title_trgm_idx ON items USING gin (title gin_trgm_ops);
CREATE INDEX items_file_name_trgm_idx ON items USING gin (file_name gin_trgm_ops);

CREATE TABLE item_tags (
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX item_tags_tag_idx ON item_tags (tag_id);

CREATE TABLE item_contents (
  item_id uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  extracted_text text,
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed', 'unsupported')),
  extraction_error text,
  extraction_attempts integer NOT NULL DEFAULT 0,
  extracted_at timestamptz,
  char_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX item_contents_pending_idx ON item_contents (extraction_status)
  WHERE extraction_status IN ('pending', 'processing');

CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('once', 'recurring')),
  timezone text NOT NULL,
  start_at timestamptz NOT NULL,
  rrule text,
  repeat_until timestamptz,
  next_run_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reminders_due_idx ON reminders (next_run_at)
  WHERE is_active AND next_run_at IS NOT NULL;

CREATE TABLE reminder_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('series', 'snooze')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'delivered'
    CHECK (status IN ('pending', 'delivered', 'snoozed', 'completed', 'cancelled', 'failed')),
  delivered_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX reminder_occurrences_unique_idx
  ON reminder_occurrences (reminder_id, kind, scheduled_for);
CREATE INDEX reminder_occurrences_pending_idx
  ON reminder_occurrences (scheduled_for)
  WHERE kind = 'snooze' AND status = 'pending';

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  occurrence_id uuid REFERENCES reminder_occurrences(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'reminder'
    CHECK (type IN ('reminder', 'trash_warning', 'system')),
  title text NOT NULL,
  body text,
  dedupe_key text NOT NULL UNIQUE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid,
  details jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC);

CREATE TABLE system_heartbeats (
  name text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER folders_set_updated_at BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reminders_set_updated_at BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER item_contents_set_updated_at BEFORE UPDATE ON item_contents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION refresh_item_search_vector(target_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE items i
  SET search_vector =
    setweight(to_tsvector('simple', coalesce(i.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i.file_name, '')), 'C') ||
    setweight(
      to_tsvector(
        'simple',
        coalesce((SELECT ic.extracted_text FROM item_contents ic WHERE ic.item_id = target_id), '')
      ),
      'D'
    )
  WHERE i.id = target_id;
END;
$$;

CREATE FUNCTION items_search_vector_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_item_search_vector(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_search_vector_after
  AFTER INSERT OR UPDATE OF title, description, file_name ON items
  FOR EACH ROW EXECUTE FUNCTION items_search_vector_trigger();

CREATE FUNCTION item_contents_search_vector_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_item_search_vector(NEW.item_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER item_contents_search_vector_after
  AFTER INSERT OR UPDATE OF extracted_text ON item_contents
  FOR EACH ROW EXECUTE FUNCTION item_contents_search_vector_trigger();
