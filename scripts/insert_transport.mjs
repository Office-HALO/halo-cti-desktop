/**
 * 交通費アイテム一括挿入スクリプト
 * 実行: node scripts/insert_transport.mjs
 */
const SUPABASE_URL = 'https://dkjfrywfhgdrkumafamj.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRramZyeXdmaGdkcmt1bWFmYW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU5ODksImV4cCI6MjA5MDA4MTk4OX0.b2lh8irUBGFNBhupXmajRTCEzdeGRyLMxD0nFXkZFEA';
const GROUP_ID    = '19302a74-35fb-48d9-a1bf-2e2195b8d0f1';

// スクリーンショットから読み取ったデータ [名前, フラット料金]
const ITEMS = [
  ['未確定',            0],
  ['花見野',         1000],
  ['豊山',           1000],
  ['北区',           2000],
  ['谷九',           2000],
  ['中央区',         2000],
  ['西区',           2000],
  ['浪速区',         2000],
  ['天王寺区',       2000],
  ['福島区',         2000],
  ['都島区',         2000],
  ['東成区',         2000],
  ['城東区',         2000],
  ['西成区',         2000],
  ['大正区',         2000],
  ['淀川区',         3000],
  ['東住吉区',       3000],
  ['住吉区',         3000],
  ['住之江区',       3000],
  ['港区',           3000],
  ['旭区',           3000],
  ['此花区',         3000],
  ['平野区',         3000],
  ['住之江区（南）', 4000],
  ['吹田市',         4000],
  ['摂津市',         4000],
  ['豊中市',         4000],
  ['寝屋川市',       4000],
  ['収益市',         4000],
  ['守口市',         4000],
  ['八尾市',         5000],
  ['高石市',         5000],
  ['松原市',         5000],
  ['藤井寺市',       7000],
  ['羽曳野市',       7000],
  ['堺（泉北区）',   4000],
  ['堺（北区）',     5000],
  ['堺（西区）',     4000],
  ['堺（東区）',     5000],
  ['堺（中区）',     6000],
  ['堺（美原区）',   6000],
  ['堺（南区）',     7000],
  ['松原市（南）',   6000],
  ['貝塚市',         6000],
  ['岸和田市',       7000],
  ['高槻市',         6000],
  ['池田市',         4000],
  ['伊丹市',         4000],
  ['西宮市',         7000],
  ['茨木市',         7000],
  ['神戸（北区）120〜',   10000],
  ['神戸（兵庫区）120〜', 10000],
  ['神戸（中央区）',       8000],
  ['神戸（須磨区）120〜', 10000],
  ['神戸（灘区）120〜',   10000],
  ['京都（南インター）',   8000],
  ['京都（三条）120〜',   10000],
  ['加東市',         10000],
  ['能勢市',          5000],
  ['宝塚市',          7000],
  ['川西市',          8000],
  ['奥河内 120〜',   10000],
  ['河内長野市 120〜',10000],
  ['安堵市',          5000],
  ['川西市（北）',    6000],
  ['橿原市 120〜',   10000],
  ['葛城市',          5000],
  ['大東市',          5000],
  ['門真市',          5000],
  ['四条畷市',        5000],
  ['枚方市',          6000],
  ['富田林市',        8000],
  ['文野市',          8000],
  ['能勢 150〜',     15000],
  ['積原市',         18000],
  ['橋本市 150〜',   12000],
  ['新宮市 170〜',   10000],
  ['吉野市',         10000],
  ['愛宕市',          8000],
  ['大和高田市 120〜',10000],
  ['大和郡山市 120〜',10000],
  ['橿原市 120〜（奈良）',10000],
  ['和歌山大潮 150〜',12000],
  ['益田市 150〜',   15000],
  ['谷子',            2000],
];

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function run() {
  // 既存アイテムを全削除（未確定以外）
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/option_items?group_id=eq.${GROUP_ID}&select=id,name`,
    { headers }
  ).then(r => r.json());

  console.log(`既存 ${existing.length} 件を削除...`);
  for (const item of existing) {
    await fetch(`${SUPABASE_URL}/rest/v1/option_items?id=eq.${item.id}`, {
      method: 'DELETE', headers,
    });
  }

  // 一括挿入
  const payload = ITEMS.map(([name, price], i) => ({
    group_id:      GROUP_ID,
    name,
    price_mode:    'flat',
    price_flat:    price,
    is_active:     true,
    display_order: i + 1,
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/option_items`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    console.log(`✅ ${ITEMS.length} 件挿入完了`);
  } else {
    const err = await res.text();
    console.error('❌ 挿入失敗:', err);
  }
}

run().catch(console.error);
