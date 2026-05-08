# HALO CTI Desktop - Claude Code 修正コンテキスト

作成日: 2026-05-06  
対象: Claude Code に渡す修正依頼用コンテキスト  
プロジェクト: `/Users/kishidarenya/Documents/Claude/Projects/halo-cti-desktop`

---

## 依頼の目的

このアプリはデリバリーヘルス店舗向けの自社CTIです。Tauri + React + Supabase + Twilioで、着信ポップアップ、顧客管理、予約入力、キャスト/シフト管理を扱います。

現状レビューで見つかったリスクを、実運用に耐える方向で修正してください。特に優先するのは以下です。

1. 個人情報と予約データのアクセス制御
2. 複数スタッフでの着信取り合い防止
3. 予約入力の保存漏れと監査ログ欠落
4. カレンダーのXSSリスク
5. 操作できそうに見えて実は未接続のUIの解消

既存の作業ツリーは汚れている可能性があります。ユーザーの未コミット変更を消さないでください。`git reset --hard` や `git checkout --` は使わないでください。

---

## 現在の技術構成

- Tauri 2
- React 19
- Vite 7
- Zustand
- Supabase Auth / Database / Realtime
- Twilio webhook: `supabase/functions/twilio-webhook/index.ts`
- メイン起動: `npm run tauri dev`
- ビルド確認: `npm run build`

主なファイル:

- `src/App.jsx`: メインシェル、着信ポップアップ起動
- `src/hooks/useRealtimeCalls.js`: call_logs INSERT購読
- `src/overlays/IncomingCallPopup.jsx`: 着信ポップアップ
- `src/screens/Incoming.jsx`: 本日着信一覧
- `src/screens/Schedule.jsx`: 本日スケジュール
- `src/screens/Customers.jsx`: 顧客管理
- `src/screens/Calendar.jsx`: 月次カレンダー
- `src/lib/auth.jsx`: 認証とstaff取得
- `src/lib/reservationWindowBridge.js`: Tauri予約別ウィンドウ起動
- `src/windows/ReservationStandaloneApp.jsx`: 予約別ウィンドウ本体
- `supabase/migrations/20260502_rls_policies.sql`: 現状のRLS
- `supabase/migrations/20260426_reservations_extra_fields.sql`: 予約追加フィールド

現状、`npm run build` は成功します。ただし大きいチャンク警告があります。

---

## 最優先の修正方針

### 1. RLSを本番向けに直す

現状の問題:

- `customers`, `reservations`, `ladies`, `call_logs`, マスタ系が `authenticated using (true)` になっている。
- ログイン済みなら全店舗・全顧客・全予約を読み書きできる。
- 顧客電話番号、住所、要注意メモ、予約履歴を扱うCTIとして危険。

やってほしいこと:

- 現在の `staff` テーブル構造を確認する。
- 可能なら `staff.email = auth.jwt()->>'email'` を使って、自分のstaff行を参照するRLS helperを作る。
- `staff.default_store_id` または所属店舗カラムを使い、店舗境界で絞る。
- 管理者だけマスタ編集・削除ができるようにする。既存にroleがなければmigrationで追加を検討する。
- `customers` は現状store_idが見当たらないため、すぐに店舗分離できない場合は以下のどちらかを提案/実装する。
  - `customers.store_id` を追加して予約/着信導線で埋める
  - 顧客は全店共有、ただし更新/削除はrole制御する
- `call_logs` は `store_id` があるので、Realtime購読とRLSの両方で店舗絞り込みする。

完了条件:

- 全員に `using (true)` のwrite権限を渡す状態をやめる。
- staffが所属しない店舗の予約/キャスト/着信ログを読めない。
- 一般スタッフがマスタやキャスト本体を削除できない。
- migrationとして再適用できるSQLを追加する。

注意:

- Supabase RLSではポリシー内の関数が重要になるため、`security definer` helperのsearch_path固定を忘れない。
- 現DBのstaff schemaが不明なら、まず安全な段階的migrationにする。

---

### 2. 月次カレンダーのXSSを潰す

問題ファイル:

- `src/screens/Calendar.jsx`

現状の問題:

- `buildGridHtml()` がDB由来のキャスト名/顧客名などをHTML文字列に直接埋め込み。
- `dangerouslySetInnerHTML` で描画している。
- `src-tauri/tauri.conf.json` の `security.csp` が `null`。
- デスクトップアプリ内でスクリプト実行されるリスクがある。

やってほしいこと:

- できれば `dangerouslySetInnerHTML` を廃止し、React要素としてカレンダーを描画する。
- 大改修が重い場合、最低限 `escapeHtml()` を実装し、HTML属性とテキストの両方を安全にエスケープする。
- `data-rsv` にJSONを入れる場合も、属性用エスケープを通す。
- 可能ならCSPも最低限設定する。ただしTauri/Vite/Supabase/Tauri updaterとの相性を壊さないように検証する。

完了条件:

- DBに `<img src=x onerror=alert(1)>` のような名前が入っても、文字として表示されるだけ。
- `npm run build` が通る。

---

### 3. 着信のclaim/ackを実装する

問題ファイル:

- `src/hooks/useRealtimeCalls.js`
- `src/overlays/IncomingCallPopup.jsx`
- `src/screens/Incoming.jsx`
- `supabase/functions/twilio-webhook/index.ts`
- `supabase/migrations/20260426_call_logs.sql` または新規migration

現状の問題:

- call_logs INSERTを全クライアントが購読し、全端末にポップアップが出る。
- 誰が応答したか、誰が処理中か、いつ確認したかが共有されない。
- 着信ポップアップの「応答/保留/切断」はローカルstateだけで、DBにも電話側にも反映されない。

推奨するDB追加:

- `call_logs.store_id`
- `call_logs.assigned_staff_id`
- `call_logs.answered_by`
- `call_logs.answered_at`
- `call_logs.acknowledged_by`
- `call_logs.acknowledged_at`
- `call_logs.hold_by`
- `call_logs.hold_at`
- `call_logs.ended_by`
- `call_logs.ended_at`
- `call_logs.ui_status` text: `ringing`, `claimed`, `answered`, `hold`, `ended`, `missed`

やってほしいこと:

- webhookで `to_number` から店舗を推定して `store_id` を埋める。店舗電話番号カラムがなければmigrationで `stores.twilio_number` などを追加するか、TODOつきで安全に残す。
- `useRealtimeCalls` は現在店舗のcallだけ購読する。
- 既に他スタッフがclaim/answeredしたcallはポップアップしない、または「他スタッフ対応中」として静かに閉じる。
- ポップアップのボタン文言を実態に合わせる。
  - Twilio操作をしないなら「応答」ではなく「対応開始」または「確認済み」
  - 「切断」は実電話を切らないなら「閉じる」または「対応終了」
  - 「保留」が未実装なら非表示にするか、DB上のhold状態だけにする
- 本日着信一覧で担当者/状態/対応時刻が見えるようにする。

完了条件:

- 複数スタッフで同じ着信を同時に扱わない設計になる。
- ボタン表示と実際の処理が一致する。
- call_logsに誰がいつ対応したか残る。

---

### 4. 予約別ウィンドウのstaff監査を直す

問題ファイル:

- `src/main.jsx`
- `src/lib/reservationWindowBridge.js`
- `src/windows/ReservationStandaloneApp.jsx`
- `src/lib/auth.jsx`

現状の問題:

- `/?rsvKey=...` の予約別ウィンドウは `AuthProvider` を通らない。
- `ReservationStandaloneApp` の `currentStaff` はZustand初期値のままになりやすい。
- 保存payloadの `updated_by` が null になり、誰が予約変更したか残らない。

やってほしいこと:

- 予約ウィンドウにもstaff情報を渡す。
- 方針はどちらか:
  - `openReservationWindow()` のlocalStorage payloadに `staff` を含める
  - 予約ウィンドウ内で `supabase.auth.getSession()` からemailを取り、staffを再取得する
- auth localStorageの既知バグを壊さないこと。`src/lib/supabase.js` のサブウィンドウread-only storageの意図を維持する。
- `created_by` も必要ならmigrationで追加する。

完了条件:

- 新規/更新/削除で `updated_by` が現在スタッフIDになる。
- 予約ウィンドウを閉じてもメイン画面が白くならない。

---

### 5. 予約フォームの保存漏れを直す

問題ファイル:

- `src/windows/ReservationStandaloneApp.jsx`
- `src/overlays/ReservationFormModal.jsx`
- `supabase/migrations/20260426_reservations_extra_fields.sql`

現状の問題:

- UIには `nomination_type` と `reception_method` がある。
- 既存予約から読もうとしている箇所もある。
- しかし保存payloadにもmigrationにもカラムがないため、選択しても永続化されない。

やってほしいこと:

- migrationで `reservations.nomination_type text`, `reservations.reception_method text` を追加する。
- `ReservationStandaloneApp` と `ReservationFormModal` の両方の保存payloadへ追加する。
- 履歴/着信ポップアップ側の表示と整合させる。

完了条件:

- 予約保存後、再編集しても指名/受付が保持される。
- 顧客履歴や着信履歴で表示が空にならない。

---

## 中優先の修正

### 6. Tauri外の新規予約導線を直す

問題ファイル:

- `src/overlays/NewReservationModal.jsx`
- `src/lib/reservationWindowBridge.js`
- `src/overlays/ReservationFormModal.jsx`

現状の問題:

- ブラウザで `localhost:1420` を見ると、`openReservationWindow()` が null を返す。
- `NewReservationModal` は即 `onClose()` するので、何も起きない。

やってほしいこと:

- Tauri環境では今の別ウィンドウ導線を維持。
- ブラウザ環境では `ReservationFormModal` をフォールバック表示する。
- もしくは開発環境だけ明確なエラートーストを出す。

完了条件:

- ブラウザ開発時に「新規予約」押下で無反応にならない。

---

### 7. 顧客検索後の詳細選択ズレを直す

問題ファイル:

- `src/screens/Customers.jsx`

現状の問題:

- `selected = customers.find(...) || filtered[0]` になっている。
- 検索やランクフィルタで一覧から消えた顧客でも詳細に残る。
- 絞り込み結果と違う顧客を編集する事故につながる。

やってほしいこと:

- `selected` は `filtered` から選ぶ。
- `q` または `rankFilter` 変更時、現在選択がfiltered外なら `filtered[0]` に移すかnullにする。

完了条件:

- 一覧に出ていない顧客の詳細が表示されない。

---

### 8. 未接続UIを整理する

問題ファイル:

- `src/components/TopBar.jsx`
- `src/screens/Schedule.jsx`
- `src/screens/Incoming.jsx`
- `src/screens/Login.jsx`

現状の問題:

- `画面を更新` ボタンに処理がない。
- スケジュール左上の「絞り込み」が未接続。
- 本日着信一覧の電話アイコンが未接続。
- `回線アクティブ · 3` は固定表示。
- Login画面の `Database online / Supabase 接続済` は実チェックではなく固定表示に見える。
- Login画面のバージョンが `v 0.1.0` で、package/Tauriは `0.2.5`。

やってほしいこと:

- 未接続ボタンは実装するか、無効表示/非表示にする。
- 固定ステータスは実データにするか、誤認しない文言にする。
- バージョン表示は `package.json` またはTauri versionに合わせる。

完了条件:

- クリック可能に見える主要UIで無反応なものをなくす。

---

## 実装の進め方

推奨順:

1. 小さく安全なUI/保存漏れ修正
   - `nomination_type`, `reception_method`
   - 顧客選択ズレ
   - 未接続UI
   - Tauri外予約フォールバック
2. XSS修正
3. 予約ウィンドウstaff監査
4. 着信claim/ack
5. RLS本格化

理由:

- 1〜3はアプリ側だけで検証しやすい。
- 4〜5はDB migrationと運用ルールを含むため、段階的に進めたい。

---

## 必ず確認すること

実装後に最低限実行:

```bash
npm run build
```

可能なら:

```bash
npm run tauri dev
```

確認シナリオ:

- ログインできる。
- 本日スケジュールが表示できる。
- 新規予約を開ける。
- 予約で指名/受付を保存し、再編集で残っている。
- 着信デモでポップアップが出る。
- 着信の対応状態がcall_logsへ残る。
- 顧客検索で一覧外の顧客詳細が残らない。
- 月次カレンダーにHTMLっぽい名前を入れても文字として表示される。

---

## 重要な注意

- このプロジェクトは実店舗の個人情報、電話番号、予約履歴、要注意メモを扱う。
- RLSや監査ログは「あとで」ではなく、本番運用前の必須項目として扱う。
- Twilio実通話を制御しないボタンに「応答」「切断」など実電話操作に見える文言を使わない。
- 予約入力のメイン導線は別OSウィンドウ版 `ReservationStandaloneApp.jsx`。ただし旧モーダル `ReservationFormModal.jsx` も残っているので、保存項目は両方揃える。
- 既存のdirty worktreeを尊重し、ユーザー変更を巻き戻さない。

---

## Claude Code への最初の依頼文サンプル

以下をそのままClaude Codeに貼って開始してください。

```text
このリポジトリは HALO CTI Desktop です。docs/CLAUDE_CODE_FIX_CONTEXT.md を読んで、レビューで見つかったCTI運用上の問題を優先順に修正してください。

まずは低リスクで検証しやすい以下から実装してください。
1. reservations に nomination_type / reception_method を保存できるようにする
2. 予約別ウィンドウで updated_by が null にならないようにする
3. Customers の検索/フィルタ後に一覧外の顧客詳細が残らないようにする
4. Calendar.jsx の dangerouslySetInnerHTML によるXSSをなくす、または最低限HTMLエスケープする
5. 未接続UIを実装/無効化する

その後、着信claim/ack設計とRLS強化に進んでください。

制約:
- ユーザーの未コミット変更を消さない
- git reset --hard / git checkout -- は使わない
- 既存のTauri予約別ウィンドウ導線とSupabase auth read-only storageの既知対策を壊さない
- npm run build で検証する
```

