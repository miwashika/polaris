/**
 * Polaris — タスク管理バックエンド v0.5
 * Google Apps Script Web App
 *
 * スクリプトプロパティ（設定 > スクリプトプロパティ）:
 *   SHARED_TOKEN     : 認証トークン（Shortcut / PWA と共有）
 *   GEMINI_API_KEY   : Google AI Studio で取得
 *   SPREADSHEET_ID   : 完了ログ用スプレッドシートのID
 *
 * サービスを追加（左ペイン「サービス」):
 *   Google Tasks API v1 → 変数名: Tasks
 */

// ═══════════════════════════════════════════════
// 定数
// ═══════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-2.5-flash';
const LOG_SHEET    = '完了ログ';
const AGING_DAYS   = 14;

// カテゴリ → リスト名のマッピング
const CAT_TO_LIST = {
  'クリニック': 'みわ歯科クリニック船橋',
  'Minowa':    '株式会社Minowa',
  '家庭':      '家庭',
  '還和':      '還和（長女）',
  '倖乃椛':    '倖乃椛（次女）',
  '翔子':      '翔子（妻）',
  '個人':      '個人',
  'その他':    'その他',
};
const LIST_TO_CAT = Object.fromEntries(Object.entries(CAT_TO_LIST).map(([k,v])=>[v,k]));
const WAITING_LIST  = '---待ち---';
const SOMEDAY_LIST  = '---Someday---';
const CATEGORIES    = Object.keys(CAT_TO_LIST);
const SPANS         = ['今週','1ヶ月','3ヶ月','6ヶ月','1年','3年','5年以上'];
const TAGS_VALID    = ['電話','5分','集中','移動中','PC'];
const URGENT_DAYS   = 3; // サーバー側の緊急判定しきい値（Labelプレフィックス計算用）

// ═══════════════════════════════════════════════
// エンドポイント
// ═══════════════════════════════════════════════

function doGet(e) {
  try {
    // GETは認証なし（読み取りのみ・個人利用）
    const tasks = getAllTasks_();
    return jsonOut_({ ok: true, tasks: tasks });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body  = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (!token || body.token !== token) {
      return jsonOut_({ ok: false, error: '認証エラー' }, 401);
    }

    const action = body.action || 'create';
    switch (action) {
      case 'create':     return handleCreate_(body);
      case 'setDue':     return handleSetDue_(body);
      case 'complete':   return handleComplete_(body);
      case 'setField':   return handleSetField_(body);
      case 'deleteTask':             return handleDelete_(body);
      case 'addTask':                return handleAddTask_(body);
      case 'generateCalendarTasks':  return handleGenerateCalendarTasks_(body);
      default:                       return jsonOut_({ ok: false, error: '不明なaction: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ═══════════════════════════════════════════════
// アクションハンドラ
// ═══════════════════════════════════════════════

function handleCreate_(body) {
  const text = String(body.text || '').trim();
  if (!text) return jsonOut_({ ok: false, error: 'textが空です', spoken: '内容が空でした' });

  const p       = classifyWithGemini_(text);
  const listId  = getOrCreateList_(CAT_TO_LIST[p.category] || 'その他');
  const taskObj = buildTaskObj_(p);
  const created = Tasks.Tasks.insert(taskObj, listId);

  const result = parseTask_(created, listId, CAT_TO_LIST[p.category] || 'その他');
  return jsonOut_({ ok: true, task: result, spoken: p.spoken || buildSpoken_(p) });
}

function handleSetDue_(body) {
  const { taskId, listId, due } = body;
  if (!taskId || !listId) return jsonOut_({ ok: false, error: 'taskId/listId必須' });

  const existing = Tasks.Tasks.get(listId, taskId);
  const quadrant = calcQuadrant_(existing, due);
  const rawTitle = stripPrefix_(existing.title);
  existing.title = '[第' + quadrant + '] ' + rawTitle;
  existing.due   = due ? due + 'T00:00:00.000Z' : null;

  const updated = Tasks.Tasks.update(existing, listId, taskId);
  return jsonOut_({ ok: true, task: parseTask_(updated, listId, '') });
}

function handleComplete_(body) {
  const { taskId, listId, doneQuadrant } = body;
  if (!taskId || !listId) return jsonOut_({ ok: false, error: 'taskId/listId必須' });

  const existing       = Tasks.Tasks.get(listId, taskId);
  existing.status      = 'completed';
  existing.completed   = new Date().toISOString();
  Tasks.Tasks.update(existing, listId, taskId);

  // 完了ログに追記
  try {
    const parsed   = parseTask_(existing, listId, '');
    const today    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const ss       = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
    let   sheet    = ss.getSheetByName(LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET);
      sheet.appendRow(['完了日','タイトル','カテゴリ','領域','importance','span']);
    }
    sheet.appendRow([today, parsed.title, parsed.category, doneQuadrant || 2, parsed.importance, parsed.span]);
  } catch (logErr) {
    // ログ失敗は無視（タスク完了は成功扱い）
    Logger.log('ログ追記失敗: ' + logErr);
  }

  return jsonOut_({ ok: true });
}

function handleDelete_(body) {
  const { taskId, listId } = body;
  if (!taskId || !listId) return jsonOut_({ ok: false, error: 'taskId/listId必須' });
  Tasks.Tasks.remove(listId, taskId);
  return jsonOut_({ ok: true });
}

function handleAddTask_(body) {
  const { title, due, category } = body;
  if (!title) return jsonOut_({ ok: false, error: 'title必須' });

  const cat    = CATEGORIES.includes(category) ? category : 'その他';
  const listId = getOrCreateList_(CAT_TO_LIST[cat]);
  const today  = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const quad   = calcQuadrantFromSpan_(1, due || null, today);
  const notes  = buildNotes_('', { importance: 1, span: '1ヶ月', tags: [], created: today, committed: false });
  const obj    = { title: '[第' + quad + '] ' + title, notes: notes };
  if (due) obj.due = due + 'T00:00:00.000Z';

  const created = Tasks.Tasks.insert(obj, listId);
  return jsonOut_({ ok: true, task: parseTask_(created, listId, CAT_TO_LIST[cat]) });
}

function handleGenerateCalendarTasks_(body) {
  const polarisAxes = body.polarisAxes || [];

  // 直近14日間の予定を取得
  const now  = new Date();
  const end  = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const cal  = CalendarApp.getDefaultCalendar();
  const evts = cal.getEvents(now, end);

  if (evts.length === 0) return jsonOut_({ ok: true, suggestions: [] });

  const eventList = evts.map(function(e) {
    return {
      title: e.getTitle(),
      start: Utilities.formatDate(e.getStartTime(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
      end:   Utilities.formatDate(e.getEndTime(),   'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    };
  });

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  const prompt =
`あなたは第2領域タスク推薦アシスタントです。JSONのみ返してください（前置き・コードフェンス禁止）。

今日: ${today}

# 人生・仕事の方向性（Polaris）
${polarisAxes.map(function(a,i){ return (i+1)+'. '+a; }).join('\n')}

# 直近2週間のカレンダー予定
${JSON.stringify(eventList)}

各予定が Polaris の方向性と関係があり、事前準備が必要なものについて、着手すべき「第2領域の準備タスク」を最大5件提案してください。
日常ルーティン（移動・食事・定例MTG等）・Polaris と無関係な予定は無視してください。

# 出力スキーマ（JSONのみ）
[{"suggestTitle":"命令形タイトル","deadlineDate":"YYYY-MM-DD（予定の2〜3日前が目安）","category":${JSON.stringify(CATEGORIES)}のいずれか,"reason":"日本語30字以内の理由"}]

提案がゼロの場合は [] を返す。`;

  const url     = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  const payload = {
    contents:         [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }

  const data = JSON.parse(res.getContentText());
  let   txt  = data.candidates[0].content.parts[0].text.trim()
                   .replace(/^```json\s*/i,'').replace(/```$/i,'').trim();
  const arr  = JSON.parse(txt);

  const suggestions = (Array.isArray(arr) ? arr : []).filter(function(s) {
    return s.suggestTitle && s.deadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(s.deadlineDate);
  }).map(function(s) {
    if (!CATEGORIES.includes(s.category)) s.category = 'その他';
    return { suggestTitle: s.suggestTitle, deadlineDate: s.deadlineDate, category: s.category, reason: s.reason || '' };
  });

  return jsonOut_({ ok: true, suggestions: suggestions });
}

function handleSetField_(body) {
  const { taskId, listId, field, value } = body;
  if (!taskId || !listId || !field) return jsonOut_({ ok: false, error: 'taskId/listId/field必須' });

  // waiting / someday はリスト移動で実現
  if (field === 'waiting' || field === 'someday') {
    const existing    = Tasks.Tasks.get(listId, taskId);
    const meta        = parseMeta_(existing.notes || '');
    const targetList  = value
      ? getOrCreateList_(field === 'waiting' ? WAITING_LIST : SOMEDAY_LIST)
      : getOrCreateList_(CAT_TO_LIST[meta.category] || 'その他');

    // メモのフラグを更新
    meta[field] = value;
    existing.notes = buildNotes_(meta.humanNotes, meta);
    Tasks.Tasks.update(existing, listId, taskId);

    // 別リストへ移動（GAS Tasks APIにはmoveがないためinsert→delete）
    if (targetList !== listId) {
      const copy = { title: existing.title, notes: existing.notes, due: existing.due };
      Tasks.Tasks.insert(copy, targetList);
      Tasks.Tasks.delete(listId, taskId);
    }
    return jsonOut_({ ok: true });
  }

  // committed などメタデータフラグ
  const existing = Tasks.Tasks.get(listId, taskId);
  const meta     = parseMeta_(existing.notes || '');
  meta[field]    = value;
  existing.notes = buildNotes_(meta.humanNotes, meta);
  Tasks.Tasks.update(existing, listId, taskId);
  return jsonOut_({ ok: true });
}

// ═══════════════════════════════════════════════
// タスク取得・パース
// ═══════════════════════════════════════════════

function getAllTasks_() {
  const lists  = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const result = [];

  lists.forEach(function(list) {
    const items = Tasks.Tasks.list(list.id, {
      showCompleted: false,
      showHidden:    false,
      maxResults:    100,
    }).items || [];

    items.forEach(function(item) {
      if (item.status === 'completed') return;
      const parsed = parseTask_(item, list.id, list.title);
      result.push(parsed);
    });
  });

  return result;
}

function parseTask_(item, listId, listName) {
  const meta      = parseMeta_(item.notes || '');
  const rawTitle  = stripPrefix_(item.title || '');
  const due       = item.due ? item.due.slice(0, 10) : null;

  return {
    id:        item.id,
    listId:    listId,
    listName:  listName,
    category:  LIST_TO_CAT[listName] || meta.category || 'その他',
    title:     rawTitle,
    rawTitle:  item.title || '',
    due:       due,
    importance: Number(meta.importance !== undefined ? meta.importance : 1),
    span:      meta.span       || '1ヶ月',
    tags:      meta.tags       || [],
    created:   meta.created    || '',
    committed: !!meta.committed,
    waiting:   listName === WAITING_LIST,
    someday:   listName === SOMEDAY_LIST,
    notes:     meta.humanNotes || '',
  };
}

// ═══════════════════════════════════════════════
// メタデータのパース / 構築
// ═══════════════════════════════════════════════

function parseMeta_(notes) {
  const parts      = notes.split('---');
  const humanNotes = parts[0].trim();
  const metaLine   = (parts[1] || '').trim();
  const result     = { humanNotes: humanNotes };

  // "key:value key2:value2" 形式をパース
  const tokens = metaLine.match(/(\w+):([^\s]+)/g) || [];
  tokens.forEach(function(t) {
    const [k, v] = t.split(':');
    if (k === 'tags') {
      result.tags = v ? v.split(',').filter(Boolean) : [];
    } else if (k === 'importance') {
      result.importance = Number(v);
    } else if (k === 'committed' || k === 'waiting' || k === 'someday') {
      result[k] = v === 'true';
    } else {
      result[k] = v;
    }
  });
  return result;
}

function buildNotes_(humanNotes, meta) {
  const parts = [
    'importance:' + (meta.importance !== undefined ? meta.importance : 1),
    'span:'       + (meta.span || '1ヶ月'),
    'tags:'       + (meta.tags || []).join(','),
    'created:'    + (meta.created || Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd')),
    'committed:'  + !!meta.committed,
  ];
  const h = (humanNotes || '').trim();
  return h ? h + '\n---\n' + parts.join(' ') : '---\n' + parts.join(' ');
}

function buildTaskObj_(p) {
  const today    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const quadrant = calcQuadrantFromSpan_(p.importance, p.due, today);
  const notes    = buildNotes_('', {
    importance: p.importance,
    span:       p.span,
    tags:       p.tags || [],
    created:    today,
    committed:  false,
  });
  const obj = {
    title: '[第' + quadrant + '] ' + p.title,
    notes: notes,
  };
  if (p.due) obj.due = p.due + 'T00:00:00.000Z';
  return obj;
}

// ═══════════════════════════════════════════════
// 象限計算
// ═══════════════════════════════════════════════

function calcQuadrant_(taskObj, due) {
  const meta       = parseMeta_(taskObj.notes || '');
  const importance = Number(meta.importance !== undefined ? meta.importance : 1);
  return calcQuadrantFromSpan_(importance, due, null);
}

function calcQuadrantFromSpan_(importance, due, today) {
  if (!due) return importance ? 2 : 4;
  const todayD  = today ? new Date(today) : new Date();
  const dueD    = new Date(due);
  todayD.setHours(0,0,0,0); dueD.setHours(0,0,0,0);
  const diff    = Math.round((dueD - todayD) / 86400000);
  const urgent  = diff <= URGENT_DAYS;
  return importance ? (urgent ? 1 : 2) : (urgent ? 3 : 4);
}

// ═══════════════════════════════════════════════
// Gemini 分類
// ═══════════════════════════════════════════════

function classifyWithGemini_(text) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const dow   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'EEEE');

  const prompt =
`あなたはタスク分類アシスタントです。入力された雑なメモを解析し、JSONだけを返してください（前置き・コードフェンス禁止）。

今日: ${today}（${dow}・日本時間）

# カテゴリ判定ルール
クリニック: みわ歯科・2F・3F・予防フロア・訪問診療・患者・スタッフ・機材・勉強会・CR（コンポジットレジン）
Minowa: 技工・外注・請求書・MS法人・経理・法人
家庭: 家族全体・家のこと
還和: 長女（かずわ）の用事
倖乃椛: 次女（こうのか）の用事
翔子: 妻（しょうこ）の用事
個人: みわ本人・健康・趣味・資産・学習
その他: 判断不能

# 出力スキーマ（このキーのみ・JSONのみ）
{
  "category": ${JSON.stringify(CATEGORIES)} のいずれか,
  "importance": 0|1,
  "span": ${JSON.stringify(SPANS)} のいずれか,
  "due": "YYYY-MM-DD" または null,
  "tags": ${JSON.stringify(TAGS_VALID)} のサブセット（配列）,
  "title": "行動が分かる命令形のタイトル（時刻があれば必ず残す）",
  "spoken": "〜、第N領域、〜で登録しました。（Siri読み上げ用）"
}

# ルール
- importance: 方向性（医院の成長・家族・自己成長）に関わるものは1、雑用・ルーチンは0
- span: 締切が明示されていればそれに合わせる。なければ文脈から推測
- due: 具体的な期日があれば日付。「来週火曜」なら日付を計算。ない場合は spanの上限（今週=+7日, 1ヶ月=+30日, 3ヶ月=+90日, 6ヶ月=+180日, 1年=+365日, 3年以上=null）
- tags: 「電話が必要」→電話, 「5分以内」→5分, 「集中して考える」→集中, 「移動中OK」→移動中, 「PC必要」→PC
- title: 「靴買う」→「ランニングシューズを買う」のように整える。時刻（例:15時）は必ずタイトルに残す

# 入力
${text}`;

  const url     = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  const payload = {
    contents:         [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };

  const res = UrlFetchApp.fetch(url, {
    method:          'post',
    contentType:     'application/json',
    payload:         JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }

  const data    = JSON.parse(res.getContentText());
  let   txt     = data.candidates[0].content.parts[0].text.trim();
  txt           = txt.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const p       = JSON.parse(txt);

  // バリデーション（保険）
  if (!CATEGORIES.includes(p.category))  p.category   = 'その他';
  if (![0,1].includes(Number(p.importance))) p.importance = 1;
  p.importance = Number(p.importance);
  if (!SPANS.includes(p.span))            p.span       = '1ヶ月';
  if (!p.title)                           p.title      = text;
  if (p.due && !/^\d{4}-\d{2}-\d{2}$/.test(p.due)) p.due = null;
  p.tags = (p.tags || []).filter(t => TAGS_VALID.includes(t));
  if (!p.spoken) p.spoken = buildSpoken_(p);

  return p;
}

function buildSpoken_(p) {
  return p.category + '、第' + calcQuadrantFromSpan_(p.importance, p.due, null) + '領域、' + p.span + 'で登録しました。' + p.title;
}

// ═══════════════════════════════════════════════
// Googleタスク リスト管理
// ═══════════════════════════════════════════════

function getOrCreateList_(name) {
  const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const hit   = lists.find(function(l) { return l.title === name; });
  if (hit) return hit.id;
  return Tasks.Tasklists.insert({ title: name }).id;
}

// ═══════════════════════════════════════════════
// ユーティリティ
// ═══════════════════════════════════════════════

function stripPrefix_(title) {
  return (title || '').replace(/^\[第[1-4]\]\s*/, '');
}

function jsonOut_(obj, status) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════
// テスト用関数（エディタから実行）
// ═══════════════════════════════════════════════

function testCreate() {
  const fake = { postData: { contents: JSON.stringify({
    token:  PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN'),
    action: 'create',
    text:   '来週火曜の15時に2階の機材選定で業者へ電話',
  }) } };
  Logger.log(doPost(fake).getContent());
}

function testGetAll() {
  Logger.log(JSON.stringify(getAllTasks_(), null, 2));
}

function initLists() {
  // 初回セットアップ：全カテゴリリストと保留リストを作成
  const allLists = [
    ...Object.values(CAT_TO_LIST),
    WAITING_LIST,
    SOMEDAY_LIST,
  ];
  allLists.forEach(function(name) {
    getOrCreateList_(name);
    Logger.log('作成/確認: ' + name);
  });
  Logger.log('完了');
}
