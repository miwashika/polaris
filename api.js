/**
 * api.js — GAS通信レイヤー
 * GASが未接続の場合はSEEDデータにフォールバックする
 */

const GAS_URL = import.meta.env.VITE_GAS_API_URL;
const TOKEN   = import.meta.env.VITE_SHARED_TOKEN;

// GASに接続できる状態かどうか
const HAS_GAS = !!(GAS_URL && TOKEN);

// ── フェッチ共通 ──────────────────────────────

async function gasGet() {
  const url = `${GAS_URL}?token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('GAS GET エラー: ' + res.status);
  return res.json();
}

async function gasPost(body) {
  // GASはapplication/jsonのPreflightリクエストを処理できないためtext/plainを使用
  const res = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify({ token: TOKEN, ...body }),
  });
  if (!res.ok) throw new Error('GAS POST エラー: ' + res.status);
  return res.json();
}

// ── 公開API ──────────────────────────────────

/**
 * タスク一覧を取得する
 * @returns {Promise<Array>} タスクオブジェクトの配列
 */
export async function fetchTasks() {
  if (!HAS_GAS) {
    console.warn('[api] GAS未接続 → SEEDデータを使用');
    return null;
  }
  const data = await gasGet();
  if (!data.ok) throw new Error(data.error || 'fetchTasks失敗');
  // GASフィールド名 → App.jsx内部フィールド名に正規化
  return (data.tasks || []).map(t => ({
    ...t,
    cat:       t.category,
    important: t.importance,
    createdAt: t.created || '',
  }));
}

/**
 * 音声テキストからタスクを作成する
 * @param {string} text - 捕捉テキスト
 * @returns {Promise<{task, spoken}>}
 */
export async function createTask(text) {
  if (!HAS_GAS) throw new Error('GAS未接続');
  const data = await gasPost({ action: 'create', text });
  if (!data.ok) throw new Error(data.error || 'createTask失敗');
  return { task: data.task, spoken: data.spoken };
}

/**
 * 期日を更新する
 * @param {string} taskId
 * @param {string} listId
 * @param {string|null} due - "YYYY-MM-DD" または null
 */
export async function setDue(taskId, listId, due) {
  if (!HAS_GAS) return; // モード: 状態はローカルのみ
  const data = await gasPost({ action: 'setDue', taskId, listId, due });
  if (!data.ok) throw new Error(data.error || 'setDue失敗');
}

/**
 * タスクを完了にする
 * @param {string} taskId
 * @param {string} listId
 * @param {number} doneQuadrant - 完了時の象限（1〜4）
 */
export async function completeTask(taskId, listId, doneQuadrant) {
  if (!HAS_GAS) return;
  const data = await gasPost({ action: 'complete', taskId, listId, doneQuadrant });
  if (!data.ok) throw new Error(data.error || 'complete失敗');
}

/**
 * フィールドを更新する（committed / waiting / someday）
 * @param {string} taskId
 * @param {string} listId
 * @param {string} field
 * @param {boolean} value
 */
export async function setField(taskId, listId, field, value) {
  if (!HAS_GAS) return;
  const data = await gasPost({ action: 'setField', taskId, listId, field, value });
  if (!data.ok) throw new Error(data.error || 'setField失敗');
}

export { HAS_GAS };
