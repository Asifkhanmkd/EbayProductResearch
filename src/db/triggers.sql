-- Update updatedAt on listings update
CREATE TRIGGER IF NOT EXISTS update_listings_timestamp
AFTER UPDATE ON listings
BEGIN
  UPDATE listings
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Update updatedAt on metrics update
CREATE TRIGGER IF NOT EXISTS update_metrics_timestamp
AFTER UPDATE ON metrics
BEGIN
  UPDATE metrics
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
