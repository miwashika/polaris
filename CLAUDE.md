# Polaris — 第2領域タスク管理システム v0.5 beta

## プロジェクト概要

**目的:** 脳の負荷を下げる捕捉→自動分類→Googleタスク連携のパイプライン  
**オーナー:** みわ歯科クリニック船橋 院長（個人・歯科クリニック・MS法人Minowaのタスクを一元管理）  
**コンセプト:** 捕捉は限りなくゼロ摩擦、分類はAI、整理は週1回

---

## v0.5 スコープ（これだけ動けばOK）

### IN（必須）
1. **GAS doPost / create** — 音声テキストを受け取りGemini 2.5 Flashで分類、Googleタスクに登録
2. **GAS doGet** — 全リストの未完了タスクを構造化JSONで返す
3. **GAS doPost / setDue** — 期日の更新
4. **GAS doPost / complete** — 完了処理 + 完了ログをスプレッドシートに1行追記
5. **GAS doPost / setField** — waiting / someday / committed フラグの更新
6. **PWA Focus ビュー** — 今日の一手・今週コミット・今日のタスク・直近3日
7. **PWA Plan ビュー** — 未スケジュール・予定済み・週カレンダー（D&D）
8. **iPhone Shortcut** — 音声入力 → GAS doPost → Siri読み上げ（設定手順書）

### OUT（v1以降）
- Polaris AIチェック（整合判定はUIのみ、定期実行なし）
- 週次推移グラフ（ログが溜まってから）
- 日次トリガーによる自動ラベル更新
- バッチ入力（複数タスク一括）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 18 + Vite + PWA（vite-plugin-pwa）|
| スタイリング | インラインスタイル（既存設計を踏襲） |
| バックエンド | Google Apps Script（Web App）|
| AI分類 | Gemini 2.5 Flash（GAS側でAPI呼び出し）|
| タスク管理 | Google Tasks API（GAS内蔵サービス）|
| 完了ログ | Google スプレッドシート（追記専用）|
| デプロイ | Netlify（GitHub連携、CI/CD）|
| リポジトリ | GitHub（miwashika/polaris）|

---

## ディレクトリ構造

```
polaris/
├── CLAUDE.md              ← このファイル
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── netlify.toml
├── public/
│   ├── manifest.json      ← PWA manifest
│   └── icons/             ← PWA icons（後で追加）
├── src/
│   ├── main.jsx
│   ├── App.jsx            ← メインUI（q2-board.jsx を実データ対応に改修）
│   ├── api.js             ← GAS通信の抽象化レイヤー
│   └── constants.js       ← 定数（カテゴリ・QUAD・カラー等）
└── gas/
    └── Code.gs            ← GASバックエンド（doGet / doPost）
```

---

## データ設計

### Googleタスクのリスト構成

```
みわ歯科クリニック船橋    ← カテゴリ: "クリニック"
株式会社Minowa           ← カテゴリ: "Minowa"
家庭                     ← カテゴリ: "家庭"
還和（長女）              ← カテゴリ: "還和"
倖乃椛（次女）            ← カテゴリ: "倖乃椛"
翔子（妻）               ← カテゴリ: "翔子"
個人                     ← カテゴリ: "個人"
---待ち---               ← waiting: true のタスク退避先
---Someday---            ← someday: true のタスク退避先
その他                   ← 分類不能
```

### タスクのタイトル形式
```
[第2] CR勉強会・次回資料の下書き
```
プレフィックス `[第N]` = 書き込み時の象限（締切から計算）。純正アプリでも見える。

### notesフィールドの形式（メタデータ）
```
（人間向けメモがあればここ）
---
importance:1 span:1ヶ月 tags:集中,PC created:2026-06-18 committed:false
```
- `---` 区切りより前 = 人間が読む部分（純正アプリに表示される）
- `---` 区切りより後 = パース用メタデータ（PWAが読む）
- `importance:1` = 重要（0=重要でない）
- `span` = スパン（今週/1ヶ月/3ヶ月/6ヶ月/1年/3年/5年以上）
- `tags` = コンテキストタグ（カンマ区切り）
- `created` = 捕捉日（YYYY-MM-DD）
- `committed` = 今週コミット（true/false）

### 完了ログ（スプレッドシート）
シート名: `完了ログ`  
列: `完了日 | タイトル | カテゴリ | 領域（番号）| importance | span`

---

## GAS エンドポイント仕様

### 認証
すべてのリクエストに `token` フィールド必須。
スクリプトプロパティ `SHARED_TOKEN` と一致しない場合は 401 を返す。

### doGet — タスク一覧取得

**リクエスト:** GET（パラメータ不要）

**レスポンス:**
```json
{
  "ok": true,
  "tasks": [
    {
      "id": "Googleタスクの内部ID",
      "listId": "タスクリストID",
      "listName": "みわ歯科クリニック船橋",
      "category": "クリニック",
      "title": "CR勉強会・次回資料の下書き",
      "rawTitle": "[第2] CR勉強会・次回資料の下書き",
      "due": "2026-06-24",
      "importance": 1,
      "span": "1ヶ月",
      "tags": ["集中", "PC"],
      "created": "2026-06-18",
      "committed": false,
      "waiting": false,
      "someday": false,
      "notes": "人間向けメモがあれば",
      "status": "needsAction"
    }
  ],
  "completedLog": []
}
```

### doPost — タスク作成・更新

リクエストボディ（JSON）:
```json
{ "token": "...", "action": "create|setDue|complete|setField", ...action固有のフィールド }
```

#### action: "create"
```json
{
  "token": "...",
  "action": "create",
  "text": "CR勉強会の資料を来週火曜までに下書き"
}
```
GAS内でGemini 2.5 Flashを呼び出し分類。レスポンス:
```json
{ "ok": true, "task": { ...タスクオブジェクト }, "spoken": "クリニック、第2領域、今週で登録しました。" }
```

#### action: "setDue"
```json
{ "token": "...", "action": "setDue", "taskId": "...", "listId": "...", "due": "2026-06-24" }
```

#### action: "complete"
```json
{ "token": "...", "action": "complete", "taskId": "...", "listId": "...", "doneQuadrant": 2 }
```

#### action: "setField"
```json
{ "token": "...", "action": "setField", "taskId": "...", "listId": "...", "field": "committed", "value": true }
```
`field` は `committed` / `waiting` / `someday` のいずれか。  
waiting=true → タスクを `---待ち---` リストへ移動  
someday=true → `---Someday---` リストへ移動

---

## Gemini分類プロンプト仕様

モデル: `gemini-2.5-flash`  
温度: 0  
出力: JSONのみ（前置きなし）

### カテゴリ判定ルール（few-shot含める）
```
クリニック: みわ歯科、2F、3F、予防フロア、訪問診療、患者、スタッフ、勉強会、機材
Minowa:    技工、外注、請求書、MS法人、経理
家庭:      家族全体・家の用事
還和:      長女（かずわ）の用事
倖乃椛:    次女（こうのか）の用事
翔子:      妻（しょうこ）の用事
個人:      みわ本人の私的なこと、健康、趣味
その他:    判断不能
```

### 出力スキーマ
```json
{
  "category": "クリニック|Minowa|家庭|還和|倖乃椛|翔子|個人|その他",
  "importance": 0|1,
  "span": "今週|1ヶ月|3ヶ月|6ヶ月|1年|3年|5年以上",
  "due": "YYYY-MM-DD or null",
  "tags": ["電話"|"5分"|"集中"|"移動中"|"PC"],
  "title": "行動が分かる命令形のタイトル（時刻があれば残す）",
  "spoken": "Siri読み上げ用の一言（〜で登録しました）"
}
```

---

## 環境変数（.env）

```
VITE_GAS_URL=https://script.google.com/macros/s/xxxxxxx/exec
VITE_GAS_TOKEN=（自分で決めたランダム文字列）
```

GAS側スクリプトプロパティ:
```
GEMINI_API_KEY=AIza...
SHARED_TOKEN=（VITE_GAS_TOKENと同じ値）
SPREADSHEET_ID=（完了ログ用スプレッドシートのID）
```

---

## デプロイ手順（Netlify）

1. GitHub に `miwashika/polaris` リポジトリ作成
2. Netlify でサイト作成 → GitHubリポジトリ連携
3. Build settings: `npm run build` / publish: `dist`
4. 環境変数に `VITE_GAS_URL` と `VITE_GAS_TOKEN` を設定
5. GAS側: デプロイ → ウェブアプリ → 実行ユーザー:自分 / アクセス:全員

---

## 実装の優先順位

1. `gas/Code.gs` — doGet + create + complete（最初に動かす）
2. `src/api.js` — GAS通信層
3. `src/App.jsx` — モックデータをapi.jsに差し替え
4. Shortcut設定手順書
5. PWA manifest + Netlifyデプロイ

---

## 注意事項

- Google Tasks APIはGASの組み込みサービス（`Tasks.Tasks`等）を使う。外部APIキー不要。
- 期日はGoogleタスクの仕様上「日付のみ」（時刻なし）。時刻はタイトル本文に残す。
- `[第N]`プレフィックスはPWAが**毎回書き込み時に再計算**する（保存しない）。
- PWAは`localStorage`不使用（Artifactの制約）。実装ではindexedDBまたはsessionStorageを使う。
- サンプルデータ（SEED）はapi.jsがGAS未接続時のフォールバックとして残す。
