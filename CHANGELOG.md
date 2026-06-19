# Changelog — Polaris

このプロジェクトの変更履歴。[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式に準拠。

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
