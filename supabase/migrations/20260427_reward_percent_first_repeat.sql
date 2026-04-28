-- 初回/リピート別パーセントバック対応
-- Gran指名（初回50%/リピート100%）や La Reine コース（初回55%/リピート60%）に対応するための
-- reward_mode = 'percent_first_vs_repeat' 用カラム追加

-- ① 新カラム追加
ALTER TABLE option_items
  ADD COLUMN IF NOT EXISTS reward_percent_first  numeric(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reward_percent_repeat numeric(5,2) DEFAULT NULL;

-- ② reward_mode の CHECK 制約を更新して 'percent_first_vs_repeat' を許可
ALTER TABLE option_items DROP CONSTRAINT IF EXISTS option_items_reward_mode_check;
ALTER TABLE option_items ADD CONSTRAINT option_items_reward_mode_check
  CHECK (reward_mode IN ('percent','flat','first_vs_repeat','none','percent_first_vs_repeat'));

COMMENT ON COLUMN option_items.reward_percent_first  IS '初回客に適用するバック率（%）。reward_mode=percent_first_vs_repeat で使用';
COMMENT ON COLUMN option_items.reward_percent_repeat IS 'リピート客に適用するバック率（%）。reward_mode=percent_first_vs_repeat で使用';
