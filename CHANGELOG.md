# Changelog — Polaris

このプロジェクトの変更履歴。[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式に準拠。

---

## [0.5.5] - 2026-06-20 · Beta

### Changed
- **AIカレンダー提案の永続化** — 取得した提案を `localStorage['polaris_ai_suggestions']` に保存。リロード・再訪問後も「追加」または「×スキップ」するまで「💡 AIからの提案」セクションに残り続ける。`calSuggestions` state の変化を useEffect で監視し自動同期
- **手動フェッチボタンを裏メニューに追加** — 「Polaris」テキストタップ → 北極星の設定モーダル最下部に「🔄 AIカレンダー提案を手動取得」ボタンを追加。1日1回制限を無視して強制フェッチし、localStorage キャッシュを上書き
- **フェッチロジックを `runCalendarFetch(force)` に統一** — 自動フェッチ（`force=false`）と手動フェッチ（`force=true`）を同一関数で管理。`force=false` は `polaris_insight_date` が今日の日付と一致する場合スキップ

---

## [0.5.4] - 2026-06-20 · Beta

### Added
- **Polaris Insight（カレンダー × AI タスク提案）** — Googleカレンダーの直近2週間の予定をGemini 2.5 Flashに渡し、第2領域の準備タスクを逆算・提案する機能
  - 1日1回のみ取得（localStorage で日付キャッシュ）。バックグラウンド実行でメイン画面の操作を妨げない
  - 取得中は画面下部に小さなトースト「🧭 カレンダーを分析中…」を表示
  - 取得完了後、中央に「✨ Polaris Insight」モーダルが出現。各提案に「タスクに追加」「スキップ」ボタンを配置
  - モーダルを「後で決める」で閉じると、未決の提案が Focus ビュー最下部の「💡 AIからの提案」セクションに残り、個別に追加・×消去が可能
- **`Code.gs` — `generateCalendarTasks` アクション** — `CalendarApp` で直近14日を取得しGeminiへ送信。`[{ suggestTitle, deadlineDate, category, reason }]` 形式で返却
- **`Code.gs` — `addTask` アクション** — 分類済みパラメータ（title / due / category）から直接Googleタスクに登録（Gemini分類をスキップ）
- **`api.js` — `generateCalendarSuggestions(polarisAxes)`** — 上記GASエンドポイントを呼び出す関数
- **`api.js` — `addTask({ title, due, category })`** — 構造化データでタスクを直接登録する関数

---

## [0.5.3] - 2026-06-20 · Beta

### Changed
- **ヘッダーレイアウト修正** — iPhone横幅オーバーフローを解消。3要素（タイトル＆日付・モードタブ・ボタン）を `justify-content:space-between` で均等配置
- **タイトル＆日付を縦積みに統合** — 「Polaris」と日付を `flex-direction:column` で1ブロックに。タップで設定モーダルを開くonClick機能はブロック全体に維持
- **ボタン文言変更** — 「週次レビュー」→「今週やること」に変更

---

## [0.5.2] - 2026-06-20 · Beta

### Changed
- **ヘッダークリーンアップ** — 歯車（Settings）ボタンを完全削除。「Polaris」テキストをタップ可能にし、クリックで北極星の設定モーダル（Polaris タブ）が直接開くように変更
- **週次レビューボタン修正** — `flexShrink:0` / `whiteSpace:nowrap` / `padding:"8px 14px"` を付与し、狭い画面でも潰れないレイアウトに修正
- **方向性チェックの移動** — 「🧭 方向性チェック」ボタンを整理（Plan）ビューの診断バナー直下に移動。Focus ビューでは一切表示されない
- **方向性バッジの条件付きレンダリング** — `alignBadge` を整理モード（`view==="plan"`）時のみ描画するよう制限。Focus ビューのカードにバッジが混入しない
- **ALIGN ラベル更新** — バッジ表示を `"沿○"/"やや"/"ズレ"` から `"🎯 沿う"/"🟡 やや"/"⚠️ ズレ"` に変更

---

## [0.5.1] - 2026-06-19 · Beta

### Added
- **SwipeRow コンポーネント** — iOS風のスワイプ・トゥ・アクションを全カードタイプに実装（外部ライブラリ不使用）
  - 左スワイプで赤い「削除」ボタンが出現
  - `touch-action: pan-y` で縦スクロールと水平スワイプを正確に判別
  - 閾値（`actionWidth / 2`）で「戻る/開きっぱなし」を切り替え
  - `cubic-bezier(0.25, 0.46, 0.45, 0.94)` によるネイティブライクなアニメーション
  - 別カードをスワイプすると `openSwipeId` により以前の開き状態が自動クローズ
  - 開いた状態のカード本体タップで閉じる（`onClickCapture` で下位の click を抑制）

### Changed
- **削除ボタンの移動** — FocusCard（通常）/ PlanCard（bar・full）/ HoldRow の各カードから常時表示の Trash2 ボタンを削除し、スワイプアクション内に統合
- FocusCard hero（今日の一手）は既存の「削除」テキストボタンをそのまま維持

---

## [0.5.0] - 2026-06-19 · Beta

### Added
- **削除機能** — 全カードタイプ（FocusCard hero/通常、PlanCard bar/full、HoldRow）にゴミ箱ボタンを追加。`window.confirm` による誤操作防止ダイアログ付き
- **GAS `deleteTask` エンドポイント** — `Tasks.Tasks.remove()` によるGoogle Tasks上の物理削除
- **キャプチャUI** — Focus画面上部に入力欄を追加。Gemini 2.5 Flashによる自動分類後にGoogleタスクへ登録（送信はボタンクリックのみ、Enterキー送信なし）
- **ローディング画面** — GASデータ取得中のスピナー表示
- **エラー画面** — 取得失敗時の再試行ボタン付きエラー表示
- **`src/main.jsx`** — Viteエントリポイントを `src/` に配置
- **`.gitignore`** — `node_modules/`、`dist/`、`.env*.local` を除外

### Changed
- **楽観的更新** — `toggleDone` / `setDue` / `toggleField` / `setCommitted` すべてがローカルStateを即時更新し、バックグラウンドでGASへ同期
- **GAS POST の CORS 対応** — `Content-Type: text/plain` を使用してプリフライトリクエストを回避
- **環境変数名** — `VITE_GAS_URL` → `VITE_GAS_API_URL`、`VITE_GAS_TOKEN` → `VITE_SHARED_TOKEN` に統一
- **フィールド正規化** — `fetchTasks()` でGASレスポンス（`category` / `importance` / `created`）をApp.jsx内部名（`cat` / `important` / `createdAt`）に変換
- **`その他` カテゴリ対応** — `CAT` マップに `"その他": "#9BA8B2"` を追加し、実データで色が `undefined` になる不具合を修正

---

## [0.4.0] - 2026-06-19 · Alpha

### Added
- **GAS バックエンド `Code.gs`** — doGet（タスク一覧）/ doPost（create / setDue / complete / setField）を実装
- **Gemini 2.5 Flash 分類** — 音声テキストをカテゴリ・象限・スパン・タグに自動分類
- **完了ログ** — `handleComplete_` がGoogleスプレッドシートの「完了ログ」シートに1行追記
- **GAS Web App デプロイ** — エンドポイントURL発行・`SHARED_TOKEN` 認証を設定
- **`api.js`** — GAS通信の抽象化レイヤー（fetchTasks / createTask / setDue / completeTask / setField）
- **iPhone Shortcut 設定手順書** (`SHORTCUT_SETUP.md`)

---

## [0.3.0] - 2026-06-18 · Prototype

### Added
- **Focus / Plan 2モードUI** — ヘッダーのタブで切り替え。Focusは縦長カード、Planはカレンダー＋未スケジュール列
- **PWA 対応** — `vite-plugin-pwa` によるマニフェスト・Service Worker 生成
- **Netlify デプロイ設定** — `netlify.toml` と GitHub連携CI/CD
- **モックデータ (SEED)** — 15件のサンプルタスクで画面全体を動作確認

### Changed
- **サブメニュー（ギアアイコン）** — 領域別 / ふりかえり / 保留 / Polaris の4タブをモーダルに統合

---

## [0.2.0] - 2026-06-17 · Concept

### Added
- **第2領域ボード v1** — 緊急度×重要度の4象限をカード形式で表示
- **D&Dカレンダー** — 週カレンダーへのドラッグ&ドロップで期日設定
- **Polaris整合チェック** — 北極星（人生の方向性）とのAI整合判定
- **週次レビューモーダル** — 今週コミットする第2タスクを最大3件選択
- **診断バナー** — 象限分布と完了履歴に基づく自動アドバイス表示

---

## [0.1.0] - 2026-06-16 · Scaffold

### Added
- **プロジェクト初期化** — Vite + React 18 + lucide-react のセットアップ
- **`CLAUDE.md`** — プロジェクト概要・データ設計・GASエンドポイント仕様・実装優先順位を定義
- **ディレクトリ構造** — `src/`・`gas/`・`public/` の骨格を作成
