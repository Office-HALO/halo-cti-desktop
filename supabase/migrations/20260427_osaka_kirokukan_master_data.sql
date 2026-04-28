-- ============================================================
-- 大阪貴楼館 マスターデータ投入
-- 実行前提: 20260427_reward_percent_first_repeat.sql を先に実行済みであること
--
-- 登録内容:
--   キャストランク: Gran★2〜★5, La Reine基本・☆1〜☆5
--   コース:         Gran（全ランク共通・50%バック）
--                   La Reine（ランク別・初回55%/リピート60%）
--   指名:           Gran（ランク別価格・初回50%/リピート100%）
-- ============================================================

DO $$
DECLARE
  v_store_id   uuid;

  -- Gran キャストランク
  v_gran2      uuid;
  v_gran3      uuid;
  v_gran4      uuid;
  v_gran5      uuid;

  -- La Reine キャストランク
  v_lr_base    uuid;
  v_lr1        uuid;
  v_lr2        uuid;
  v_lr3        uuid;
  v_lr4        uuid;
  v_lr5        uuid;

  -- option_group IDs
  v_gran_course_gid   uuid;
  v_gran_nom_gid      uuid;
  v_lr_course_gid     uuid;

  -- option_item ID（都度再利用）
  v_item_id    uuid;

BEGIN

  -- ① 店舗 ID 取得
  SELECT id INTO v_store_id FROM stores WHERE code = 'main' LIMIT 1;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION '店舗 (code=main) が見つかりません。先に stores テーブルを確認してください。';
  END IF;

  -- ② キャストランク登録
  --    unique(store_id, code) があるので UPSERT で冪等に
  INSERT INTO cast_ranks (store_id, code, label, display_order) VALUES
    (v_store_id, 'gran2',   'Gran★2',       10),
    (v_store_id, 'gran3',   'Gran★3',       20),
    (v_store_id, 'gran4',   'Gran★4',       30),
    (v_store_id, 'gran5',   'Gran★5',       40),
    (v_store_id, 'lr_base', 'La Reine基本', 50),
    (v_store_id, 'lr1',     'La Reine☆1',  60),
    (v_store_id, 'lr2',     'La Reine☆2',  70),
    (v_store_id, 'lr3',     'La Reine☆3',  80),
    (v_store_id, 'lr4',     'La Reine☆4',  90),
    (v_store_id, 'lr5',     'La Reine☆5', 100)
  ON CONFLICT (store_id, code)
    DO UPDATE SET label = EXCLUDED.label, display_order = EXCLUDED.display_order;

  SELECT id INTO v_gran2   FROM cast_ranks WHERE store_id = v_store_id AND code = 'gran2';
  SELECT id INTO v_gran3   FROM cast_ranks WHERE store_id = v_store_id AND code = 'gran3';
  SELECT id INTO v_gran4   FROM cast_ranks WHERE store_id = v_store_id AND code = 'gran4';
  SELECT id INTO v_gran5   FROM cast_ranks WHERE store_id = v_store_id AND code = 'gran5';
  SELECT id INTO v_lr_base FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr_base';
  SELECT id INTO v_lr1     FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr1';
  SELECT id INTO v_lr2     FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr2';
  SELECT id INTO v_lr3     FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr3';
  SELECT id INTO v_lr4     FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr4';
  SELECT id INTO v_lr5     FROM cast_ranks WHERE store_id = v_store_id AND code = 'lr5';

  -- ─────────────────────────────────────────────────────────
  -- ③ Gran コース
  --    客払い: 70分¥28,000 〜 30分ごと+¥12,000
  --    バック: 客払いの50%（ランク共通）
  -- ─────────────────────────────────────────────────────────
  INSERT INTO option_groups (store_id, kind, label, required, multi_select, display_order)
  VALUES (v_store_id, 'course', 'Gran コース', true, false, 10)
  RETURNING id INTO v_gran_course_gid;

  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, price_flat, reward_mode, reward_percent)
  VALUES
    (v_gran_course_gid, '70分',  10,  70, 'flat',  28000, 'percent', 50),
    (v_gran_course_gid, '90分',  20,  90, 'flat',  34000, 'percent', 50),
    (v_gran_course_gid, '120分', 30, 120, 'flat',  46000, 'percent', 50),
    (v_gran_course_gid, '150分', 40, 150, 'flat',  58000, 'percent', 50),
    (v_gran_course_gid, '180分', 50, 180, 'flat',  70000, 'percent', 50),
    (v_gran_course_gid, '210分', 60, 210, 'flat',  82000, 'percent', 50),
    (v_gran_course_gid, '240分', 70, 240, 'flat',  94000, 'percent', 50);

  -- ─────────────────────────────────────────────────────────
  -- ④ Gran 指名
  --    ランク別価格: ★2=¥2,000 / ★3=¥3,000 / ★4=¥4,000 / ★5=¥5,000
  --    バック: 初回50% / リピート100%
  -- ─────────────────────────────────────────────────────────
  INSERT INTO option_groups (store_id, kind, label, required, multi_select, display_order)
  VALUES (v_store_id, 'nomination', 'Gran 指名', false, false, 20)
  RETURNING id INTO v_gran_nom_gid;

  INSERT INTO option_items
    (group_id, name, display_order, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES
    (v_gran_nom_gid, '指名料', 10, 'per_rank', 'percent_first_vs_repeat', 50, 100)
  RETURNING id INTO v_item_id;

  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_gran2, 2000),
    (v_item_id, v_gran3, 3000),
    (v_item_id, v_gran4, 4000),
    (v_item_id, v_gran5, 5000);

  -- ─────────────────────────────────────────────────────────
  -- ⑤ La Reine コース（指名込み）
  --    ランク別価格: 基本+0 / ☆1+1,000 / ☆2+2,000 / ☆3+3,000 / ☆4+4,000 / ☆5+5,000
  --    バック: 初回55% / リピート60%（端数100円切り上げ）
  -- ─────────────────────────────────────────────────────────
  INSERT INTO option_groups (store_id, kind, label, required, multi_select, display_order)
  VALUES (v_store_id, 'course', 'La Reine コース', true, false, 30)
  RETURNING id INTO v_lr_course_gid;

  -- 70分: 基本¥38,000 〜 ☆5¥43,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '70分', 10, 70, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 38000),
    (v_item_id, v_lr1,     39000),
    (v_item_id, v_lr2,     40000),
    (v_item_id, v_lr3,     41000),
    (v_item_id, v_lr4,     42000),
    (v_item_id, v_lr5,     43000);

  -- 90分: 基本¥46,000 〜 ☆5¥51,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '90分', 20, 90, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 46000),
    (v_item_id, v_lr1,     47000),
    (v_item_id, v_lr2,     48000),
    (v_item_id, v_lr3,     49000),
    (v_item_id, v_lr4,     50000),
    (v_item_id, v_lr5,     51000);

  -- 120分: 基本¥62,000 〜 ☆5¥67,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '120分', 30, 120, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 62000),
    (v_item_id, v_lr1,     63000),
    (v_item_id, v_lr2,     64000),
    (v_item_id, v_lr3,     65000),
    (v_item_id, v_lr4,     66000),
    (v_item_id, v_lr5,     67000);

  -- 150分: 基本¥78,000 〜 ☆5¥83,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '150分', 40, 150, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 78000),
    (v_item_id, v_lr1,     79000),
    (v_item_id, v_lr2,     80000),
    (v_item_id, v_lr3,     81000),
    (v_item_id, v_lr4,     82000),
    (v_item_id, v_lr5,     83000);

  -- 180分: 基本¥94,000 〜 ☆5¥99,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '180分', 50, 180, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 94000),
    (v_item_id, v_lr1,     95000),
    (v_item_id, v_lr2,     96000),
    (v_item_id, v_lr3,     97000),
    (v_item_id, v_lr4,     98000),
    (v_item_id, v_lr5,     99000);

  -- 210分: 基本¥110,000 〜 ☆5¥115,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '210分', 60, 210, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 110000),
    (v_item_id, v_lr1,     111000),
    (v_item_id, v_lr2,     112000),
    (v_item_id, v_lr3,     113000),
    (v_item_id, v_lr4,     114000),
    (v_item_id, v_lr5,     115000);

  -- 240分: 基本¥126,000 〜 ☆5¥131,000
  INSERT INTO option_items
    (group_id, name, display_order, duration_min, price_mode, reward_mode, reward_percent_first, reward_percent_repeat)
  VALUES (v_lr_course_gid, '240分', 70, 240, 'per_rank', 'percent_first_vs_repeat', 55, 60)
  RETURNING id INTO v_item_id;
  INSERT INTO option_item_rank_prices (item_id, cast_rank_id, price) VALUES
    (v_item_id, v_lr_base, 126000),
    (v_item_id, v_lr1,     127000),
    (v_item_id, v_lr2,     128000),
    (v_item_id, v_lr3,     129000),
    (v_item_id, v_lr4,     130000),
    (v_item_id, v_lr5,     131000);

  RAISE NOTICE '大阪貴楼館マスターデータ投入完了';
  RAISE NOTICE '  キャストランク: Gran★2〜★5, La Reine基本・☆1〜☆5';
  RAISE NOTICE '  Granコース: 7コース（70〜240分）';
  RAISE NOTICE '  Gran指名:   ランク別（★2=¥2,000〜★5=¥5,000）';
  RAISE NOTICE '  La Reineコース: 7コース（70〜240分）ランク別';
  RAISE NOTICE '';
  RAISE NOTICE '⚠ 設定画面の空の「コース料金」グループは手動で削除してください';

END $$;
