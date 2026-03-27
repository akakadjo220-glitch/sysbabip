-- Add ai_context column for OpenRouter Qwen AI Knowledge Base
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_context TEXT DEFAULT '';
