# HALO CTI Desktop — 引き継ぎドキュメント

作成日: 2026-04-26  
対象: 別AIへの引き継ぎ・コンテキスト共有用

---

## 1. プロジェクト概要

**HALO CTI** は風俗店（大阪貴楼館）向けのデスクトップ CTI（Computer Telephony Integration）システム。Tauri 2（Rust + WebView）製のデスクトップアプリで、以下を一画面で管理する。

- Twilio 経由の着信ポップアップ（顧客自動識別）
- 予約入力・ガントチャート表示
- 顧客 CRM（来店履歴・タグ・メモ）
- 在籍女性シフト管理
- 売上・料金計算

---

## 2. 技術スタック

| 層 | 技術 |
|---|---|
| デスクトップフレームワーク | Tauri 2 (Rust) |
| フロントエンド | React 19 + Zustand 5 |
| ビルドツール | Vite 7 |
| DB / Auth / Realtime | Supabase (PostgreSQL) |
| 電話連携 | Twilio (webhook → Supabase Edge Function) |
| 自動アップデート | Tauri updater plugin + GitHub Releases |
| バージョン | 0.2.3 |

---

## 3. インフラ情報

| 項目 | 値 |
|---|---|
| Supabase Project URL | `https://dkjfrywfhgdrkumafamj.supabase.co` |
| Supabase Project Ref | `dkjfrywfhgdrkumafamj` |
| Twilio Account SID | （GitHub Secrets に設定済み） |
| Twilio テスト番号 | `+1 978 205 1856`（US番号。動作確認用） |
| Edge Function URL | `https://dkjfrywfhgdrkumafamj.supabase.co/functions/v1/twilio-webhook` |
| ローカル開発 | `npm run tauri dev`（Vite dev server: port 1420） |
| プロジェクトパス | `/Users/kishidarenya/Documents/Claude/Projects/halo-cti-desktop/` |

---

## 4. ディレクトリ構造

```
halo-cti-desktop/
├── src/
│   ├── main.jsx                    # エントリポイント。rsvKey判定でサブウィンドウ分岐
│   ├── App.jsx                     # メインシェル。画面遷移・着信ハンドリング
│   ├── styles.css                  # グローバルCSS（テーマ変数・Density・Pattern）
│   ├── components/
│   │   ├── Avatar.jsx              # アバター
│   │   ├── Icon.jsx                # アイコン
│   │   ├── SideNav.jsx             # サイドナビ
│   │   ├── TopBar.jsx              # トップバー
│   │   ├── Toast.jsx               # トースト通知UI
│   │   ├── Updater.jsx             # 自動更新UI
│   │   └── ...
│   ├── hooks/
│   │   ├── useCallLogs.js          # 着信ログ取得 + Realtime購読
│   │   ├── useCustomers.js         # 顧客一覧取得 + Realtime購読
│   │   ├── useRealtimeCalls.js     # 着信リアルタイム受信 → コールバック
│   │   └── useShifts.js            # シフト＋予約取得 + Realtime購読 + refresh()
│   ├── lib/
│   │   ├── auth.jsx                # Supabase Auth Context
│   │   ├── supabase.js             # Supabaseクライアント（サブウィンドウ用read-only auth）
│   │   ├── reservationWindowBridge.js  # Tauri WebviewWindowで予約フォームを別OSウィンドウで開く
│   │   ├── pricing.js              # 料金計算エンジン（ランク継承・指名報酬・3P倍率）
│   │   ├── stores.js               # 店舗一覧取得・currentStoreId管理
│   │   ├── toast.js                # トーストpub/sub（showToast / subscribeToast）
│   │   ├── utils.js                # 日付フォーマット・normalizePhone
│   │   ├── csv.js                  # CSV出力（UTF-8 BOM付き）
│   │   └── ringtone.js             # Web Audio APIによる着信音合成
│   ├── overlays/
│   │   ├── ReservationFormModal.jsx    # 予約入力フォーム（3カラム・フローティング）
│   │   ├── CustomerFloat.jsx           # 顧客詳細フローティングパネル
│   │   ├── IncomingCallPopup.jsx       # 着信ポップアップ
│   │   ├── NewCustomerModal.jsx        # 新規顧客登録
│   │   └── NewReservationModal.jsx     # 新規予約（openReservationWindowを呼ぶラッパー）
│   ├── screens/
│   │   ├── Schedule.jsx            # 本日スケジュール（ガントチャート）
│   │   ├── Incoming.jsx            # 本日着信
│   │   ├── Customers.jsx           # 顧客管理
│   │   ├── Cast.jsx                # 在籍女性管理
│   │   ├── ShiftEdit.jsx           # シフト管理
│   │   ├── Calendar.jsx            # 月次カレンダー
│   │   ├── Approvals.jsx           # 承認管理
│   │   ├── Reports.jsx             # レポート・CSV出力
│   │   ├── Settings.jsx            # 設定ハブ
│   │   └── settings/
│   │       ├── CastRanksSettings.jsx   # キャストランク設定
│   │       ├── OptionGroupEditor.jsx   # オプショングループ設定
│   │       ├── OptionItemEditor.jsx    # オプション料金設定
│   │       ├── PersonalSettings.jsx    # 個人設定
│   │       └── StoresSettings.jsx      # 店舗設定
│   ├── store/
│   │   └── state.js                # Zustandグローバルストア
│   └── windows/
│       └── ReservationStandaloneApp.jsx  # 予約サブウィンドウ用アプリ
├── src-tauri/
│   ├── capabilities/
│   │   ├── default.json            # メインウィンドウ権限（allow-create-webview-window含む）
│   │   └── reservation-window.json # rsv_win_*サブウィンドウ権限
│   ├── tauri.conf.json             # Tauriアプリ設定
│   └── src/main.rs, lib.rs         # Rustエントリポイント
├── supabase/
│   ├── migrations/
│   │   ├── 20260426_phase1_master_data.sql     # マスターデータテーブル群
│   │   ├── 20260426_phase3_reservations_extend.sql  # 予約テーブル拡張
│   │   └── 20260426_call_logs.sql              # 着信ログテーブル
│   └── functions/
│       └── twilio-webhook/index.ts             # Twilio着信webhookハンドラ
└── vite.config.js                  # HMR timeout=120000に設定済み
```

---

## 5. データベーステーブル一覧

### 既存テーブル（Supabase UIから作成済み）

| テーブル | 主な用途 |
|---|---|
| `stores` | 店舗（multi-tenant対応） |
| `staff` | スタッフ（認証ユーザー紐付け） |
| `ladies` | 在籍女性（display_name, cast_rank_id, store_id） |
| `shifts` | シフト（lady_id, shift_date, start_time, end_time） |
| `customers` | 顧客（name, phone_normalized, rank, tags, memo等） |
| `reservations` | 予約（詳細は下記） |
| `call_logs` | 着信ログ（Twilio webhook経由） |
| `cast_ranks` | キャストランク（store_idごと） |
| `option_groups` | オプショングループ（kind: course/nomination/extension等） |
| `option_items` | オプション料金項目 |
| `option_item_rank_prices` | ランク別料金オーバーライド |

### reservations テーブルの主カラム

```
id, customer_id, store_id, lady_id,
reserved_date, start_time, end_time, duration_min,
status (reserved/received/working/complete/hold/cancelled),
room_no, memo, amount, course, hotel,
selected_items (jsonb), cast_reward,
fee_adjustment, reward_adjustment,
payment_method, advance_cash,
is_triple, is_first_meet
```

### call_logs テーブル

```
id, call_sid (unique), from_number, to_number,
started_at, status, callback_status (none/pending/done),
memo, store_id
```

---

## 6. 主要機能の実装詳細

### 6-1. 着信フロー

```
スマホ/固定電話 → Twilio番号(+1 978 205 1856)
  → POST https://dkjfrywfhgdrkumafamj.supabase.co/functions/v1/twilio-webhook
  → call_logs にINSERT
  → Supabase Realtime → useRealtimeCalls.js → onIncoming()
  → IncomingCallPopup 表示（顧客名・来店回数・タグ・本日予約情報）
  → TwiML返却（FORWARD_TO設定時は転送、未設定時は音声案内）
```

Twilio Secrets（Supabase Edge Function）:
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `FORWARD_TO`: 転送先電話番号（未設定=転送なし）
- `SKIP_SIGNATURE_VALIDATION`: `true`（開発中）→ 本番は `false`

### 6-2. 予約ウィンドウ（別OSウィンドウ）

```
openReservationWindow({ customer, reservation, onSaved, onDeleted })
  → localStorage に rsv_in_${key} で初期データ保存
  → Tauri WebviewWindow rsv_win_${key} を開く（URL: /?rsvKey=key）
  → main.jsx が rsvKey を検出 → ReservationStandaloneApp を描画
  → 保存時: emit('rsv_saved_${key}', data) → onSaved() → ガントチャートrefresh()
  → 削除時: emit('rsv_deleted_${key}', id) → onDeleted() → refresh()
```

ウィンドウサイズ: 1120×700px、最小900×560px、リサイズ可能

### 6-3. 料金計算エンジン（pricing.js）

- **KIND_ORDER**: course → nomination → extension → event → option → discount → transport → hotel → driver → media → other
- **effectivePrice(item, rankId, rankPrices)**: ランク別料金 → ランク継承 → フラット価格の順でフォールバック
- **rewardFor(item, price, isFirstMeet)**: flat / percent / first_vs_repeat の3モード

### 6-4. Supabase クライアントの注意点

サブウィンドウ（rsvKey付きURL）では auth のトークン自動更新を無効化している。
これは、サブウィンドウのクライアントがlocalStorageを書き換えてメインウィンドウの
AuthStateChangeを誤発火させ、画面が真っ白になるバグを防ぐための措置。

```js
// supabase.js より
const isRsvWindow = new URLSearchParams(window.location.search).has('rsvKey');
export const supabase = createClient(URL, KEY, isRsvWindow ? {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    storage: { getItem: (k) => localStorage.getItem(k), setItem: () => {}, removeItem: () => {} }
  }
} : {});
```

### 6-5. Vite HMR設定

サブウィンドウを閉じたときにメインウィンドウが再読み込みされないよう、
HMRのtimeoutを120秒に設定している。

```js
// vite.config.js
hmr: { timeout: 120000, overlay: false }
```

---

## 7. Zustand グローバルストア（state.js）

| キー | 型 | 説明 |
|---|---|---|
| currentStaff | object | ログイン中スタッフ |
| todayDate | string | 表示中の日付（YYYY-MM-DD） |
| currentStoreId | string | 選択中店舗ID（localStorage永続化） |
| stores | array | 利用可能店舗一覧 |
| callsDate | string | 着信ログ表示日 |
| calYear/calMonth | number | カレンダー表示年月 |
| allLadies | array | 全女性キャッシュ |
| allCustomers | array | 全顧客キャッシュ |
| callPopupPos | object | 着信ポップアップ座標 |

---

## 8. 解決済み既知問題

| 問題 | 原因 | 対処 |
|---|---|---|
| 予約ウィンドウを閉じるとメイン画面が真っ白 | Supabase Auth cross-window interference | サブウィンドウをread-only auth storageで初期化 |
| Vite HMRで画面が白くなる | HMR timeout=5000が短すぎた | timeout=120000に変更 |
| 女性選択でフリーしか出ない | `is_on_shift`カラムが存在しない + `.or()`が400エラー | `select('*')`に変更してJS側でフィルタリング |
| 予約を確定できない | customer必須チェックで弾かれていた | customer_id nullを許容するよう変更 |
| デプロイせずテストできない | - | `npm run tauri dev`で開発中はホットリロード可能 |

---

## 9. Tauri ウィンドウ構成

| ウィンドウ | ラベル | URL | 権限 |
|---|---|---|---|
| メインウィンドウ | `main` | `/` | default.json |
| 予約サブウィンドウ | `rsv_win_${key}` | `/?rsvKey=${key}` | reservation-window.json |

---

## 10. 自動更新フロー

- GitHub Actions でビルド → GitHub Releases にアップロード
- Tauri updater plugin が起動時にチェック
- `Updater.jsx` がUI表示
- 更新時は `tauri.conf.json` の `version` と `package.json` の `version` を両方上げてリリース

---

## 11. 開発コマンド

```bash
# 開発サーバー起動（ホットリロード）
cd /Users/kishidarenya/Documents/Claude/Projects/halo-cti-desktop
npm run tauri dev

# プロダクションビルド
npm run tauri build

# Edge Functionデプロイ
npx supabase functions deploy twilio-webhook --project-ref dkjfrywfhgdrkumafamj

# Secretsセット
npx supabase secrets set KEY=value --project-ref dkjfrywfhgdrkumafamj
```

---

## 12. 今後の残タスク（優先順）

1. **日本050番号取得** — Twilio Regulatory Bundle申請（代表身分証）
2. **FORWARD_TO設定** — 日本番号取得後、店の電話に転送設定
3. **Twilio署名検証を有効化** — `SKIP_SIGNATURE_VALIDATION=false`（本番）
4. **顧客選択UIを予約フォームに追加** — 新規予約時に顧客を検索・選択できるようにする
5. **オプション選択UIの完成確認** — コース・指名・延長等の選択が正しく保存されるか
6. **GitHub Releaseでv0.2.x配布** — ユーザーが自動更新できる状態にする
7. **RLS（Row Level Security）の精査** — 全テーブルのポリシーを本番向けに整備

---

## 13. チーム

| 名前 | メール | 役割 |
|---|---|---|
| 岸田蓮矢 | kishida@halo-gws.com | 開発担当・管理者 |
| 大城道郎 | oshiro@halo-gws.com | 代表・オーナー |

---

*このドキュメントは2026-04-26時点の状態を記録しています。*
