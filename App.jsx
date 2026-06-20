import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  fetchTasks,
  createTask,
  setDue     as apiSetDue,
  completeTask,
  setField   as apiSetField,
  deleteTask as apiDeleteTask,
  addTask    as apiAddTask,
  generateCalendarSuggestions,
  HAS_GAS,
} from "./api.js";
import { Check, RotateCcw, Pin, Pause, Archive, Sun, ListChecks, X, Calendar, Star, Inbox, Trash2 } from "lucide-react";

/**
 * 第2領域ボード v2 — 「今日（focus）」と「整理（plan）」の2モード
 * quad / review / hold / polaris はギアアイコンのサブメニューへ
 */

const C = {
  paper: "#F4F6F8", surface: "#FFFFFF", ink: "#19232D", sub: "#5C6B77",
  line: "#DBE2E7", lineSoft: "#E8EDF0",
  q1: "#C0392B", q2: "#1C8C84", q3: "#D88A2B", q4: "#9BA8B2",
  warn: "#E5973A", warnSoft: "#FBF0DF", todayTint: "#F0F8F6",
  age: "#C0392B", ageBg: "#FBEEEC",
};
const TINT = { 1: "#FCEBE9", 2: "#FFFFFF", 3: "#FCF3E5", 4: "#FFFFFF" };
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
const AGING_DAYS = 14;
const QUAD = {
  1: { label: "第1", name: "緊急かつ重要",   color: C.q1 },
  2: { label: "第2", name: "重要・緊急でない", color: C.q2 },
  3: { label: "第3", name: "緊急・重要でない", color: C.q3 },
  4: { label: "第4", name: "どちらでもない",  color: C.q4 },
};
const CAT = {
  "クリニック": "#2D6CDF", "Minowa": "#6D5BD0", "家庭": "#1E9E8A",
  "還和": "#D9663E", "倖乃椛": "#C8517E", "翔子": "#B07A1E", "個人": "#6B7785",
  "その他": "#9BA8B2",
};
const catColor = (cat) => CAT[cat] || "#9BA8B2";
const TAGS = ["電話", "5分", "集中", "移動中", "PC"];
const ALIGN = {
  on:   { label: "🎯 沿う", color: "#1C8C84", bg: "#EAF5F3" },
  weak: { label: "🟡 やや", color: "#E5973A", bg: "#FBF0DF" },
  off:  { label: "⚠️ ズレ", color: "#C0392B", bg: "#FCEBE9" },
};
const POLARIS_SEED = [
  { id: 9001, text: "予防中心の歯科医院をつくる" },
  { id: 9002, text: "訪問診療で地域医療に貢献する" },
  { id: 9003, text: "家族との時間を最優先する" },
  { id: 9004, text: "Minowaで技工の質と経営を両立させる" },
];
const TREND_BASE = [{ w:"5/12",v:18 },{ w:"5/19",v:25 },{ w:"5/26",v:21 },{ w:"6/2",v:33 },{ w:"6/9",v:40 }];

const pad    = (n) => String(n).padStart(2, "0");
const keyOf  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays= (base,n) => { const d=new Date(base); d.setDate(d.getDate()+n); return d; };
const WD     = ["日","月","火","水","木","金","土"];
const TODAY  = new Date(); TODAY.setHours(0,0,0,0);
const k      = (n) => keyOf(addDays(TODAY,n));
const daysUntil = (dk) => {
  if (!dk) return null;
  const [y,m,d]=dk.split("-").map(Number);
  const due=new Date(y,m-1,d); due.setHours(0,0,0,0);
  return Math.round((due-TODAY)/86400000);
};
const ageDays = (ck) => { const d=daysUntil(ck); return d===null?0:-d; };

const SEED = [
  { id:1,  title:"3F予防フロアの内装業者を3社選定",      cat:"クリニック", important:1, span:"3ヶ月", due:null,  createdAt:k(-25), tags:["PC","集中"] },
  { id:2,  title:"訪問診療チームの人員計画をまとめる",    cat:"クリニック", important:1, span:"1ヶ月", due:null,  createdAt:k(-6),  tags:["集中"] },
  { id:3,  title:"Minowa 技工外注の請求書を整理",        cat:"Minowa",    important:1, span:"今週",  due:k(2),  createdAt:k(-3),  tags:["PC"] },
  { id:4,  title:"倖乃椛の予防接種を予約する",           cat:"倖乃椛",    important:1, span:"今週",  due:k(5),  createdAt:k(-2),  tags:["電話","5分","移動中"] },
  { id:5,  title:"還和の保育園書類を提出",               cat:"還和",      important:1, span:"今週",  due:k(1),  createdAt:k(-4),  tags:["5分"] },
  { id:6,  title:"妻と9月沖縄の予定をすり合わせ",        cat:"翔子",      important:1, span:"1ヶ月", due:null,  createdAt:k(-10), tags:[] },
  { id:7,  title:"歯科医師会の会報に目を通す",           cat:"クリニック", important:0, span:"今週",  due:k(2),  createdAt:k(-1),  tags:["5分"] },
  { id:8,  title:"CR勉強会・次回資料の下書き",           cat:"クリニック", important:1, span:"1ヶ月", due:k(6),  createdAt:k(-5),  tags:["集中","PC"] },
  { id:9,  title:"Lace walletへ移行作業",               cat:"個人",      important:1, span:"3ヶ月", due:null,  createdAt:k(-18), tags:["PC","集中"] },
  { id:10, title:"クレカのポイントを整理する",            cat:"個人",      important:0, span:"3ヶ月", due:null,  createdAt:k(-8),  tags:["PC"] },
  { id:11, title:"ランニングシューズを買う",             cat:"個人",      important:0, span:"1ヶ月", due:null,  createdAt:k(-3),  tags:[] },
  { id:12, title:"内装業者Aの見積り返信",               cat:"クリニック", important:1, span:"今週",  due:null,  createdAt:k(-4),  tags:["電話"], waiting:true },
  { id:13, title:"融資書類の銀行確認",                  cat:"Minowa",    important:1, span:"1ヶ月", due:null,  createdAt:k(-7),  tags:[], waiting:true },
  { id:14, title:"矯正分野の研修参加を検討",             cat:"クリニック", important:1, span:"3年",   due:null,  createdAt:k(-30), tags:[], someday:true },
  { id:15, title:"家族で海外旅行",                      cat:"家庭",      important:1, span:"5年以上",due:null,  createdAt:k(-40), tags:[], someday:true },
  { id:101,title:"CR用マトリックスバンドを発注",         cat:"クリニック", important:1, span:"今週",  due:k(-1), tags:["PC"],      done:true,doneQuadrant:1,doneAt:k(-1) },
  { id:102,title:"3F導線の素案をスケッチ",              cat:"クリニック", important:1, span:"3ヶ月", due:null,  tags:["集中"],    done:true,doneQuadrant:2,doneAt:k(-2) },
  { id:103,title:"還和の検診を予約",                    cat:"還和",      important:1, span:"今週",  due:k(-3), tags:["電話"],    done:true,doneQuadrant:1,doneAt:k(-3) },
  { id:104,title:"勉強会の出欠返信",                    cat:"クリニック", important:0, span:"今週",  due:k(-1), tags:["5分"],     done:true,doneQuadrant:3,doneAt:k(-1) },
  { id:105,title:"Minowa 月次の数字を確認",             cat:"Minowa",    important:1, span:"1ヶ月", due:null,  tags:["PC"],      done:true,doneQuadrant:2,doneAt:k(-4) },
  { id:106,title:"沖縄の航空券候補を比較",              cat:"翔子",      important:1, span:"3ヶ月", due:null,  tags:["PC"],      done:true,doneQuadrant:2,doneAt:k(-5) },
  { id:107,title:"SNSの通知を整理",                    cat:"個人",      important:0, span:"6ヶ月", due:null,  tags:[],          done:true,doneQuadrant:4,doneAt:k(-2) },
  { id:108,title:"消耗品を緊急発注",                    cat:"クリニック", important:1, span:"今週",  due:k(-6), tags:["電話"],    done:true,doneQuadrant:1,doneAt:k(-6) },
];

// ── ヘルパー ──────────────────────────────────────────
const btn     = { width:22,height:22,borderRadius:6,border:"1px solid #DBE2E7",background:"#fff",cursor:"pointer",fontSize:13,color:"#5C6B77",lineHeight:1 };
const miniBtn = { width:22,height:22,borderRadius:7,border:"1px solid #DBE2E7",background:"#fff",display:"grid",placeItems:"center",cursor:"pointer",color:"#5C6B77" };
const Empty   = ({ text }) => <div style={{ fontSize:12,color:"#9BA8B2",padding:"20px 4px",textAlign:"center",border:"1px dashed #DBE2E7",borderRadius:10 }}>{text}</div>;

function TrendChart({ data }) {
  const W=460,H=110,pX=24,pY=16,n=data.length,maxV=Math.max(50,...data.map(d=>d.v));
  const x=(i)=>pX+(i*(W-pX*2))/(n-1), y=(v)=>H-pY-(v/maxV)*(H-pY*2);
  const pts=data.map((d,i)=>`${x(i)},${y(d.v)}`).join(" ");
  return (
    <div style={{ width:"100%",overflowX:"auto" }} className="scroll">
      <svg viewBox={`0 0 ${W} ${H+18}`} style={{ width:"100%",minWidth:360,display:"block" }}>
        {[0,25,50].map(g=>(
          <g key={g}>
            <line x1={pX} x2={W-pX} y1={y(g)} y2={y(g)} stroke="#E8EDF0" strokeWidth="1"/>
            <text x={pX-6} y={y(g)+3} textAnchor="end" fontSize="9" fill="#9BA8B2" fontFamily="ui-monospace,monospace">{g}</text>
          </g>
        ))}
        <polyline points={pts} fill="none" stroke={C.q2} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((d,i)=>(
          <g key={i}>
            <circle cx={x(i)} cy={y(d.v)} r={i===n-1?4.5:3} fill={i===n-1?C.q2:"#fff"} stroke={C.q2} strokeWidth="2"/>
            <text x={x(i)} y={H+12} textAnchor="middle" fontSize="9.5" fill={C.sub} fontFamily="ui-monospace,monospace">{d.w}</text>
            {i===n-1 && <text x={x(i)} y={y(d.v)-9} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.q2} fontFamily="ui-monospace,monospace">{d.v}%</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── スワイプ行コンポーネント ───────────────────────────
function SwipeRow({ rowId, openId, setOpenId, onDelete, radius=12, actionWidth=72, children }) {
  const [offset, setOffset] = React.useState(0);
  const [live,   setLive]   = React.useState(false);
  const drag = React.useRef({ x0:0, y0:0, isH:null, wasOpen:false, cur:0 });
  const isOpen = openId === rowId;

  React.useEffect(()=>{ if(!isOpen && !live) setOffset(0); },[isOpen, live]);

  const ts=(e)=>{
    const t=e.touches[0];
    const start=isOpen?-actionWidth:0;
    drag.current={x0:t.clientX,y0:t.clientY,isH:null,wasOpen:isOpen,cur:start};
    setOffset(start); setLive(true);
  };
  const tm=(e)=>{
    const r=drag.current, t=e.touches[0];
    const dx=t.clientX-r.x0, dy=t.clientY-r.y0;
    if(r.isH===null){
      if(Math.abs(dx)<5&&Math.abs(dy)<5) return;
      r.isH=Math.abs(dx)>Math.abs(dy);
    }
    if(!r.isH){setLive(false);return;}
    const next=Math.min(4,Math.max(-actionWidth,(r.wasOpen?-actionWidth:0)+dx));
    r.cur=next; setOffset(next);
  };
  const te=()=>{
    const r=drag.current; setLive(false);
    if(!r.isH) return;
    if(r.cur<-actionWidth/2){setOpenId(rowId); setOffset(-actionWidth);}
    else{if(isOpen)setOpenId(null); setOffset(0);}
  };

  const shown=live?offset:(isOpen?-actionWidth:0);
  return(
    <div style={{position:'relative',overflow:'hidden',borderRadius:radius}}>
      <div style={{position:'absolute',inset:0,display:'flex',justifyContent:'flex-end'}}>
        <button
          onClick={(e)=>{e.stopPropagation();setOpenId(null);onDelete(rowId);}}
          style={{width:actionWidth,border:'none',background:C.q1,color:'#fff',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,fontSize:11,fontWeight:700,borderRadius:`0 ${radius}px ${radius}px 0`}}
        ><Trash2 size={16}/><span>削除</span></button>
      </div>
      <div
        onTouchStart={ts} onTouchMove={tm} onTouchEnd={te}
        onClickCapture={(e)=>{if(isOpen){e.stopPropagation();setOpenId(null);}}}
        style={{transform:`translateX(${shown}px)`,transition:live?'none':'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',touchAction:'pan-y',position:'relative',zIndex:1,willChange:'transform'}}
      >{children}</div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────
export default function App() {
  const [tasks,    setTasks]    = useState(HAS_GAS ? [] : SEED);
  const [loading,  setLoading]  = useState(HAS_GAS);
  const [gasError, setGasError] = useState(null);
  const [capture,  setCapture]  = useState("");
  const [capturing,setCapturing]= useState(false);
  const [captureErr,setCaptureErr]=useState(null);
  const [view,     setView]     = useState("focus");   // "focus" | "plan"
  const [subOpen,  setSubOpen]  = useState(false);
  const [subView,  setSubView]  = useState("quad");    // "quad"|"review"|"hold"|"polaris"
  const [urgentDays,setUrgentDays]=useState(3);
  const [filter,   setFilter]   = useState("すべて");
  const [tagFilter,setTagFilter]=useState(null);
  const [selected, setSelected] = useState(null);
  const [dragId,   setDragId]   = useState(null);
  const [overCol,  setOverCol]  = useState(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [polaris,  setPolaris]  = useState(POLARIS_SEED);
  const [polarisInput,setPolarisInput]=useState("");
  const [align,    setAlign]    = useState({});
  const [checking,   setChecking]   = useState(false);
  const [checkErr,   setCheckErr]   = useState(null);
  const [openSwipeId,   setOpenSwipeId]   = useState(null);
  const [calSuggestions,setCalSuggestions]= useState(()=>{ try{return JSON.parse(localStorage.getItem('polaris_ai_suggestions')||'[]');}catch{return[];} });
  const [insightOpen,   setInsightOpen]   = useState(false);
  const [insightLoading,setInsightLoading]= useState(false);

  const week = useMemo(()=>Array.from({length:7},(_,i)=>{
    const d=addDays(TODAY,i);
    return { i,key:keyOf(d),dow:d.getDay(),wd:WD[d.getDay()],dom:d.getDate(),mon:d.getMonth()+1 };
  }),[]);

  const loadTasks = useCallback(async()=>{
    setLoading(true);
    setGasError(null);
    try {
      const result = await fetchTasks();
      if (result !== null) setTasks(result);
      // null → GAS未接続、SEEDデータのまま
    } catch(e) {
      setGasError(e.message || 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{ if(HAS_GAS) loadTasks(); },[loadTasks]);

  // calSuggestions が変わるたびにlocalStorageへ永続化
  useEffect(()=>{ localStorage.setItem('polaris_ai_suggestions',JSON.stringify(calSuggestions)); },[calSuggestions]);

  // カレンダー提案フェッチ（force=true で日付制限を無視）
  const runCalendarFetch=useCallback((force=false)=>{
    if(!HAS_GAS||insightLoading) return;
    const todayKey=keyOf(TODAY);
    if(!force&&localStorage.getItem('polaris_insight_date')===todayKey) return;
    setInsightLoading(true);
    generateCalendarSuggestions(polaris.map(p=>p.text))
      .then(list=>{ if(list.length>0){setCalSuggestions(list);setInsightOpen(true);} localStorage.setItem('polaris_insight_date',todayKey); })
      .catch(()=>{})
      .finally(()=>setInsightLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[polaris,insightLoading]);

  // 初回マウント時に1日1回の自動フェッチ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ runCalendarFetch(false); },[]);

  // 計算関数
  const quadrantOf=(t)=>{ const d=daysUntil(t.due),u=d!==null&&d<=urgentDays; return t.important?(u?1:2):(u?3:4); };
  const approaching=(t)=>{ const d=daysUntil(t.due); return t.important===1&&d!==null&&d>urgentDays&&d<=urgentDays+3; };
  const relText=(d)=>d===null?"未定":d<0?`${-d}日超過`:d===0?"今日":d===1?"明日":`${d}日後`;
  const sortDue=(a,b)=>{ const da=daysUntil(a.due),db=daysUntil(b.due); if(da===null&&db===null)return 0; if(da===null)return 1; if(db===null)return-1; return da-db; };

  const visCat =(t)=>filter==="すべて"||t.cat===filter;
  const visTag =(t)=>tagFilter===null||(t.tags||[]).includes(tagFilter);
  const visible=(t)=>visCat(t)&&visTag(t);
  const isActive=(t)=>!t.done&&!t.waiting&&!t.someday;
  const isAging =(t)=>isActive(t)&&t.due===null&&t.important===1&&ageDays(t.createdAt)>=AGING_DAYS;

  // アクション（楽観的更新 → バックグラウンドでAPI同期）
  const setDue=async(id,due)=>{
    const t=tasks.find(x=>x.id===id);
    setTasks(ts=>ts.map(x=>x.id===id?{...x,due}:x));
    if(t?.listId){ try{ await apiSetDue(t.id,t.listId,due); }catch(_){} }
  };
  const toggleDone=async(id)=>{
    const t=tasks.find(x=>x.id===id);
    if(!t) return;
    if(t.done){
      // 完了取り消し（ローカルのみ）
      setTasks(ts=>ts.map(x=>x.id===id?{...x,done:false,doneQuadrant:undefined,doneAt:undefined}:x));
      return;
    }
    const q=quadrantOf(t);
    setTasks(ts=>ts.map(x=>x.id===id?{...x,done:true,doneQuadrant:q,doneAt:keyOf(TODAY)}:x));
    if(t.listId){ try{ await completeTask(t.id,t.listId,q); }catch(_){} }
  };
  const toggleField=async(id,field)=>{
    const t=tasks.find(x=>x.id===id);
    if(!t) return;
    const val=!t[field];
    setTasks(ts=>ts.map(x=>x.id===id?{...x,[field]:val}:x));
    if(t.listId){ try{ await apiSetField(t.id,t.listId,field,val); }catch(_){} }
  };
  const setCommitted=async(id,val)=>{
    const t=tasks.find(x=>x.id===id);
    setTasks(ts=>ts.map(x=>x.id===id?{...x,committed:val}:x));
    if(t?.listId){ try{ await apiSetField(t.id,t.listId,'committed',val); }catch(_){} }
  };

  const handleCapture=async()=>{
    const text=capture.trim();
    if(!text||capturing) return;
    setCapturing(true); setCaptureErr(null);
    try {
      const {task,spoken}=await createTask(text);
      setTasks(ts=>[{...task,cat:task.category,important:task.importance,createdAt:task.created||''},...ts]);
      setCapture('');
      if(spoken) alert(spoken);
    } catch(e){
      setCaptureErr(e.message||'登録に失敗しました');
    } finally {
      setCapturing(false);
    }
  };
  const handleDelete=async(id)=>{
    if(!window.confirm('このタスクを完全に削除しますか？')) return;
    const t=tasks.find(x=>x.id===id);
    setTasks(ts=>ts.filter(x=>x.id!==id));
    if(t?.listId){ try{ await apiDeleteTask(t.id,t.listId); }catch(_){} }
  };

  const approveSuggestion=async(s)=>{
    setCalSuggestions(cs=>cs.filter(x=>x!==s));
    try{
      const {task}=await apiAddTask({title:s.suggestTitle,due:s.deadlineDate,category:s.category});
      setTasks(ts=>[{...task,cat:task.category,important:task.importance,createdAt:task.created||''},...ts]);
    }catch(_){}
  };
  const skipSuggestion=(s)=>setCalSuggestions(cs=>cs.filter(x=>x!==s));

  const addPolaris=()=>{ const v=polarisInput.trim(); if(!v)return; setPolaris(p=>[...p,{id:Date.now(),text:v}]); setPolarisInput(""); };
  const delPolaris=(id)=>setPolaris(p=>p.filter(x=>x.id!==id));
  const place=(id,due)=>{ setDue(id,due); setSelected(null); };
  const onTapTarget=(due)=>{ if(selected!=null)place(selected,due); };

  async function runAlignment() {
    if(polaris.length===0){setCheckErr("先に方向性を1つ以上設定してください。");return;}
    setChecking(true);setCheckErr(null);
    try {
      const items=tasks.filter(t=>!t.done&&!t.someday).map(t=>({id:t.id,title:t.title,cat:t.cat,quad:quadrantOf(t)}));
      const prompt="あなたはタスクの方向性整合を判定するアシスタントです。\n\n# 人生・仕事の方向性(Polaris)\n"+
        polaris.map((x,i)=>(i+1)+". "+x.text).join("\n")+
        "\n\n# 判定対象タスク(JSON)\n"+JSON.stringify(items)+
        "\n\n各タスクが上記の方向性にどれだけ沿うかを判定し、JSON配列のみ返してください(前置き・コードフェンス禁止)。"+
        "\n形式: [{\"id\":number,\"align\":\"on\"|\"weak\"|\"off\",\"why\":\"日本語20字以内の理由\"}]"+
        "\non=明確に沿う / weak=ややズレ・間接的 / off=無関係または逆行。idは入力のidを使うこと。";
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]}),
      });
      if(!res.ok){setCheckErr("APIエラー (HTTP "+res.status+")");return;}
      const data=await res.json();
      if(data&&data.error){setCheckErr("APIエラー: "+(data.error.message||"unknown"));return;}
      let txt=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      const m=txt.match(/\[[\s\S]*\]/);
      if(!m){setCheckErr("応答を解釈できませんでした。再試行してください。");return;}
      const arr=JSON.parse(m[0]);
      const map={};arr.forEach(r=>{if(ALIGN[r.align])map[r.id]={align:r.align,why:r.why};});
      if(Object.keys(map).length===0){setCheckErr("判定結果が空でした。方向性を具体的にして再試行を。");return;}
      setAlign(map);
    } catch(e){setCheckErr("判定に失敗: "+(e&&e.message?e.message:"不明なエラー"));}
    finally{setChecking(false);}
  }

  // 派生データ
  const active        = tasks.filter(t=>isActive(t)&&visible(t));
  const activeAll     = tasks.filter(t=>isActive(t));  // フィルタなし（今日のタスク用）
  const backlog       = active.filter(t=>t.due===null).sort((a,b)=>b.important-a.important);
  const scheduled     = active.filter(t=>t.due!==null).sort(sortDue);
  const dayTasks      = (key)=>active.filter(t=>t.due===key).sort((a,b)=>quadrantOf(a)-quadrantOf(b));
  const todayTasks    = activeAll.filter(t=>t.due===keyOf(TODAY)).sort((a,b)=>quadrantOf(a)-quadrantOf(b));
  // 今日以降3日以内が期限、または →第1 に迫っているもの（今日分を除く）
  const upcomingDays  = [1,2,3].map(n=>({
    label: n===1?"明日":n===2?"明後日":`${n}日後`,
    key: k(n),
    items: activeAll.filter(t=>t.due===k(n)).sort((a,b)=>quadrantOf(a)-quadrantOf(b)),
  })).filter(g=>g.items.length>0);
  const approachList  = activeAll.filter(t=>approaching(t)&&!(daysUntil(t.due)>=1&&daysUntil(t.due)<=3)).sort(sortDue);
  const tally         = [1,2,3,4].map(n=>active.filter(t=>quadrantOf(t)===n).length);
  const total         = tally.reduce((a,b)=>a+b,0);
  const waitingList   = tasks.filter(t=>t.waiting&&!t.done&&visible(t));
  const somedayList   = tasks.filter(t=>t.someday&&!t.done&&visible(t));
  const committedList = tasks.filter(t=>t.committed);
  const committedActive=committedList.filter(t=>!t.done);
  const committedDone = committedList.filter(t=>t.done).length;
  const reviewCands   = tasks.filter(t=>isActive(t)&&t.due===null&&t.important===1&&t.span!=="3年"&&t.span!=="5年以上");
  const completed     = tasks.filter(t=>t.done&&visible(t));
  const cdist         = [1,2,3,4].map(n=>completed.filter(t=>t.doneQuadrant===n).length);
  const ctotal        = completed.length;
  const q2share       = ctotal?Math.round((cdist[1]/ctotal)*100):0;
  const alignList     = tasks.filter(t=>!t.done&&!t.someday&&align[t.id]);
  const alignCount    = {on:0,weak:0,off:0};
  alignList.forEach(t=>{alignCount[align[t.id].align]++;});
  const offList       = alignList.filter(t=>align[t.id].align!=="on").sort((a,b)=>(align[b.id].align==="off"?1:0)-(align[a.id].align==="off"?1:0));

  const todayPick=(()=>{
    const q2=activeAll.filter(t=>quadrantOf(t)===2);
    const dated=q2.filter(t=>t.due).sort(sortDue);
    if(dated[0])return{t:dated[0],kind:"q2"};
    const old=q2.filter(t=>t.due===null).sort((a,b)=>ageDays(b.createdAt)-ageDays(a.createdAt));
    if(old[0])return{t:old[0],kind:"q2"};
    const q1=activeAll.filter(t=>quadrantOf(t)===1).sort(sortDue);
    if(q1[0])return{t:q1[0],kind:"q1"};
    return null;
  })();

  const _pct=(x)=>Math.round(x*100);
  const _sh=(arr,i,t)=>(t?arr[i]/t:0);
  const TONE={good:{col:C.q2,bg:"#EAF5F3"},bad:{col:C.q1,bg:"#FCEBE9"},warn:{col:C.warn,bg:C.warnSoft},neutral:{col:C.sub,bg:"#F2F5F7"}};

  const diagBoard=(()=>{
    if(total===0)return{...TONE.neutral,text:"進行中のタスクがありません。",advice:"まず思いついたことを捕捉するところから。ショートカットで放り込みましょう。"};
    const q1r=_sh(tally,0,total),q2r=_sh(tally,1,total),q3r=_sh(tally,2,total),q4r=_sh(tally,3,total);
    const unsched2=backlog.filter(t=>t.important===1).length;
    const approachN=active.filter(t=>approaching(t)).length;
    const agingN=active.filter(t=>isAging(t)).length;
    if(q1r>=0.40)return{...TONE.bad,text:`第1領域が${tally[0]}件（${_pct(q1r)}%）—— 火消しモードです。`,advice:`今週は第1を片付けつつ、第2（${tally[1]}件）を早めに日程化しましょう。`};
    if(approachN>=2)return{...TONE.warn,text:`第1まで迫るタスクが${approachN}件あります。`,advice:"「→第1」バッジのカードを今すぐ早い日に置けば、ほぼ片付きます。"};
    if(agingN>=1)return{...TONE.warn,text:`重要なのに${AGING_DAYS}日以上動いていないタスクが${agingN}件あります。`,advice:"今このレビューで「日程化・Someday・捨てる」のどれかを決めましょう。"};
    if(unsched2>=3&&q2r>=0.40)return{...TONE.warn,text:`重要な第2が${unsched2}件、日取り未定で宙ぶらりです。`,advice:"未スケジュール欄から2〜3件をカレンダーへ。「いつかやる」は結局やりません。"};
    if(q3r>=0.30)return{...TONE.warn,text:`第3領域が${tally[2]}件（${_pct(q3r)}%）—— 割り込みが多い状態です。`,advice:"待ちにできるものは待ちフラグへ。"};
    if(q4r>=0.25)return{...TONE.warn,text:`第4領域が${tally[3]}件（${_pct(q4r)}%）—— 雑事混入。`,advice:"やらないと決める候補を1件、Someday棚へ。"};
    if(q2r>=0.50&&unsched2<=1)return{...TONE.good,text:`第2が${tally[1]}件（${_pct(q2r)}%）と厚く、ほぼ日程化済み。`,advice:"理想的。週次レビューで第1が増えていないか確認するだけでOK。"};
    return{...TONE.neutral,text:`第2 ${tally[1]}件・第1 ${tally[0]}件 —— バランスは悪くありません。`,advice:`未スケジュールの第2が${unsched2}件。週1回の日程化習慣が鍵です。`};
  })();

  const diagReview=(()=>{
    if(ctotal===0)return{...TONE.neutral,text:"まだ完了タスクがありません。",advice:"タスクを完了させると、ここにパターンが積み上がります。"};
    const q1r=_sh(cdist,0,ctotal),q2r=_sh(cdist,1,ctotal),q3r=_sh(cdist,2,ctotal),q4r=_sh(cdist,3,ctotal);
    if(q2r>=0.50&&q1r<=0.20)return{...TONE.good,text:`完了の${_pct(q2r)}%が第2領域 —— 先回りで片付けられています。`,advice:"コヴィーの目指す姿。第1の割合が上がったら早めに察知しましょう。"};
    if(q1r>=0.45)return{...TONE.bad,text:`完了の${_pct(q1r)}%が第1領域 —— 火消し完了が中心です。`,advice:`第2のうちに着手すれば第1に落ちる前に終わります。第2を1件だけ今週の早い日に置いてみましょう。`};
    if(q3r>=0.30)return{...TONE.warn,text:`完了の${_pct(q3r)}%が第3領域 —— 緊急だが重要でない仕事が中心。`,advice:"第3を減らし第2の完了比率を上げるのが目標。"};
    if(q4r>=0.20)return{...TONE.warn,text:`完了の${_pct(q4r)}%が第4領域 —— やらなくてよい仕事を消化しています。`,advice:"第4は完了してもエネルギーの浪費。今後はリストに入れず捨てましょう。"};
    return{...TONE.neutral,text:`完了${ctotal}件 —— まだ傾向は見えにくい段階です。`,advice:"20件を超えると自分のパターンが見えてきます。"};
  })();

  // ── UI パーツ ──────────────────────────────────────

  // Focus 用カード（ゆったり）
  const FocusCard=({t,hero})=>{
    const q=quadrantOf(t),meta=QUAD[q],d=daysUntil(t.due),warn=approaching(t);
    const aging=isAging(t);
    if(hero)return(
      <div style={{ background:"#fff",borderRadius:16,padding:"22px 20px",border:`1px solid ${C.line}`,borderLeft:`4px solid ${meta.color}`,boxShadow:"0 2px 8px #19232d0e" }}>
        <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:12 }}>
          <Sun size={14} color={C.q2}/>
          <span style={{ fontFamily:MONO,fontSize:11,letterSpacing:".1em",color:C.sub }}>今日の一手</span>
          <span style={{ fontFamily:MONO,fontSize:10.5,fontWeight:800,color:meta.color,marginLeft:"auto" }}>{meta.label}</span>
        </div>
        <div style={{ fontSize:19,fontWeight:800,color:C.ink,lineHeight:1.35,marginBottom:14 }}>{t.title}</div>
        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:16 }}>
          <span style={{ fontSize:12,color:CAT[t.cat],fontWeight:700,background:`${CAT[t.cat]}15`,padding:"3px 10px",borderRadius:20 }}>{t.cat}</span>
          {(t.tags||[]).map(tg=><span key={tg} style={{ fontSize:11,color:C.sub,background:C.lineSoft,padding:"2px 8px",borderRadius:5 }}>{tg}</span>)}
          <span style={{ fontFamily:MONO,fontSize:12,color:d!==null&&d<=urgentDays?meta.color:C.sub,marginLeft:"auto" }}>{t.due?`${t.due.slice(5).replace("-","/")} · ${relText(d)}`:aging?`停滞${ageDays(t.createdAt)}日`:"日取り未定"}</span>
        </div>
        <button onClick={()=>toggleDone(t.id)} style={{ width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:14,fontWeight:700,color:"#fff",background:meta.color,border:"none",borderRadius:11,padding:"11px",cursor:"pointer" }}><Check size={16}/>完了にする</button>
        <button onClick={()=>handleDelete(t.id)} style={{ width:"100%",marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:12,color:C.sub,background:"none",border:`1px solid ${C.line}`,borderRadius:11,padding:"8px",cursor:"pointer" }}><Trash2 size={13}/>削除</button>
      </div>
    );
    return(
      <SwipeRow rowId={t.id} openId={openSwipeId} setOpenId={setOpenSwipeId} onDelete={handleDelete} radius={12}>
        <div onClick={()=>toggleDone(t.id)} style={{ display:"flex",alignItems:"center",gap:12,background:"#fff",padding:"13px 14px",border:`1px solid ${C.line}`,borderLeft:`3px solid ${meta.color}`,cursor:"pointer",transition:"background .1s" }}>
          <div style={{ width:22,height:22,borderRadius:7,border:`1.5px solid ${meta.color}55`,background:"#fff",display:"grid",placeItems:"center",flexShrink:0,color:meta.color }}><Check size={13}/></div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:600,color:C.ink,lineHeight:1.35 }}>{t.title}</div>
            <div style={{ display:"flex",alignItems:"center",gap:7,marginTop:4,flexWrap:"wrap" }}>
              <span style={{ fontSize:11,color:CAT[t.cat],fontWeight:600 }}>{t.cat}</span>
              <span style={{ fontFamily:MONO,fontSize:11,color:d!==null&&d<=urgentDays?meta.color:C.sub }}>{t.due?`${t.due.slice(5).replace("-","/")} · ${relText(d)}`:aging?`停滞${ageDays(t.createdAt)}日`:"日取り未定"}</span>
              {warn&&<span className="pulse" style={{ fontSize:10,fontWeight:700,color:C.warn }}>→第1</span>}
            </div>
          </div>
          <span style={{ fontFamily:MONO,fontSize:10.5,fontWeight:800,color:meta.color }}>{meta.label}</span>
        </div>
      </SwipeRow>
    );
  };

  // Plan 用カード（bar / full）
  const alignBadge=(t)=>{ if(view!=="plan") return null; const r=align[t.id]; if(!r||!ALIGN[r.align])return null; const a=ALIGN[r.align]; return <span title={r.why} style={{ fontSize:10,fontWeight:700,color:a.color,background:a.bg,padding:"1px 6px",borderRadius:5 }}>{a.label}</span>; };

  const PlanCard=({t,mode})=>{
    const q=quadrantOf(t),meta=QUAD[q],d=daysUntil(t.due),warn=approaching(t),isSel=selected===t.id,aging=isAging(t);
    const dragProps={
      draggable:true,
      onDragStart:(e)=>{if(e.target&&e.target.closest&&e.target.closest("input,button")){e.preventDefault();return;}setDragId(t.id);},
      onDragEnd:()=>setDragId(null),
      onClick:(e)=>{e.stopPropagation();setSelected(isSel?null:t.id);},
    };
    const frame={background:isSel?"#fff":aging?C.ageBg:TINT[q],border:`${q===1?2:1.5}px solid ${meta.color}`,boxShadow:isSel?`0 0 0 3px ${meta.color}33`:"0 1px 2px #19232d0a",opacity:dragId===t.id?0.4:1,cursor:"pointer",transition:"box-shadow .15s"};
    if(mode==="bar")return(
      <SwipeRow rowId={t.id} openId={openSwipeId} setOpenId={setOpenSwipeId} onDelete={handleDelete} radius={7} actionWidth={60}>
        <div {...dragProps} style={{...frame,borderRadius:7,padding:"5px 7px"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            {t.committed&&<Pin size={10} color={C.q2} fill={C.q2}/>}
            <span style={{fontFamily:MONO,fontSize:9.5,fontWeight:800,color:meta.color}}>{meta.label}</span>
            <span style={{fontSize:12,color:C.ink,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,minWidth:0}}>{t.title}</span>
            {alignBadge(t)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3}}>
            <span style={{width:7,height:7,borderRadius:2,background:CAT[t.cat],flexShrink:0}}/>
            <span style={{fontFamily:MONO,fontSize:9.5,color:d!==null&&d<=urgentDays?meta.color:C.sub}}>{relText(d)}</span>
            {warn&&<span className="pulse" style={{fontSize:9,fontWeight:700,color:C.warn}}>→第1</span>}
            <button onClick={(e)=>{e.stopPropagation();toggleDone(t.id);}} aria-label="完了" style={{marginLeft:"auto",width:17,height:17,borderRadius:5,border:`1px solid ${meta.color}55`,background:"#fff",display:"grid",placeItems:"center",cursor:"pointer",color:meta.color}}><Check size={10}/></button>
          </div>
        </div>
      </SwipeRow>
    );
    return(
      <SwipeRow rowId={t.id} openId={openSwipeId} setOpenId={setOpenSwipeId} onDelete={handleDelete} radius={11}>
        <div {...dragProps} style={{...frame,borderRadius:11,padding:"9px 11px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            {t.committed&&<Pin size={12} color={C.q2} fill={C.q2}/>}
            <span style={{fontFamily:MONO,fontSize:10.5,fontWeight:800,color:meta.color}}>{meta.label}</span>
            <span style={{fontSize:10.5,color:CAT[t.cat],fontWeight:600,background:`${CAT[t.cat]}14`,padding:"1px 7px",borderRadius:20}}>{t.cat}</span>
            {alignBadge(t)}
            {aging&&<span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:C.age,marginLeft:"auto"}}>停滞{ageDays(t.createdAt)}日</span>}
            {!aging&&<span style={{fontFamily:MONO,fontSize:10,color:C.sub,marginLeft:"auto"}}>{t.span}</span>}
          </div>
          <div style={{fontSize:13.5,color:C.ink,lineHeight:1.35,fontWeight:500}}>{t.title}</div>
          {(t.tags||[]).length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{t.tags.map(tg=><span key={tg} style={{fontSize:10,color:C.sub,background:C.lineSoft,padding:"1px 7px",borderRadius:5}}>{tg}</span>)}</div>}
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10.5,color:C.sub}}><Calendar size={12}/>日付</span>
              <input type="date" value={t.due||""} min={keyOf(TODAY)} draggable={false} onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} onChange={(e)=>{e.stopPropagation();setDue(t.id,e.target.value||null);}} style={{fontFamily:MONO,fontSize:11,color:t.due?C.ink:C.sub,border:`1px solid ${C.line}`,borderRadius:7,padding:"3px 6px",background:"#fff",cursor:"pointer",colorScheme:"light"}}/>
            </span>
            {warn&&<span className="pulse" style={{fontSize:10.5,fontWeight:700,color:C.warn,background:C.warnSoft,padding:"1px 8px",borderRadius:20}}>第1まであと{d-urgentDays}日</span>}
            <span style={{marginLeft:"auto",display:"flex",gap:4}}>
              <button onClick={(e)=>{e.stopPropagation();toggleField(t.id,"waiting");}} title="待ちにする" style={miniBtn}><Pause size={12}/></button>
              <button onClick={(e)=>{e.stopPropagation();toggleField(t.id,"someday");}} title="Somedayへ" style={miniBtn}><Archive size={12}/></button>
              <button onClick={(e)=>{e.stopPropagation();toggleDone(t.id);}} aria-label="完了" style={{...miniBtn,color:C.q2}}><Check size={13}/></button>
            </span>
          </div>
        </div>
      </SwipeRow>
    );
  };

  const Chip=({name})=>{ const on=filter===name,col=name==="すべて"?C.ink:CAT[name]; return <button onClick={()=>setFilter(name)} style={{fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:20,cursor:"pointer",border:`1px solid ${on?col:C.line}`,color:on?"#fff":C.sub,background:on?col:"#fff"}}>{name}</button>; };
  const TagChip=({name})=>{ const on=tagFilter===name; return <button onClick={()=>setTagFilter(on?null:name)} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:6,cursor:"pointer",border:`1px solid ${on?C.ink:C.line}`,color:on?"#fff":C.sub,background:on?C.ink:"#fff"}}>{name}</button>; };
  const HoldRow=({t,kind})=>(
    <SwipeRow rowId={t.id} openId={openSwipeId} setOpenId={setOpenSwipeId} onDelete={handleDelete} radius={9}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",border:`1px solid ${C.line}`,borderLeft:`3px solid ${kind==="wait"?C.q3:C.sub}`,background:"#fff"}}>
        <span style={{width:7,height:7,borderRadius:2,background:CAT[t.cat],flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.title}</div>
          <div style={{display:"flex",gap:7,marginTop:2}}>
            <span style={{fontSize:10.5,color:CAT[t.cat],fontWeight:600}}>{t.cat}</span>
            <span style={{fontFamily:MONO,fontSize:10.5,color:C.sub}}>{kind==="wait"?`${ageDays(t.createdAt)}日待機中`:t.span}</span>
          </div>
        </div>
        <button onClick={()=>toggleField(t.id,kind==="wait"?"waiting":"someday")} style={{flexShrink:0,display:"flex",alignItems:"center",gap:4,fontSize:11,color:C.sub,background:"#fff",border:`1px solid ${C.line}`,borderRadius:7,padding:"4px 8px",cursor:"pointer"}}><RotateCcw size={12}/>ボードへ</button>
      </div>
    </SwipeRow>
  );

  const banner=(d,label)=>(
    <div style={{display:"flex",gap:11,alignItems:"flex-start",background:d.bg,border:`1px solid ${d.col}40`,borderLeft:`3px solid ${d.col}`,borderRadius:11,padding:"11px 13px",marginBottom:14}}>
      <span style={{fontFamily:MONO,fontSize:10,fontWeight:800,color:d.col,paddingTop:2,flexShrink:0}}>{label}</span>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13,fontWeight:600,color:C.ink,lineHeight:1.5}}>{d.text}</div>
        <div style={{fontSize:12,color:C.sub,marginTop:3,lineHeight:1.6}}>→ {d.advice}</div>
      </div>
    </div>
  );

  const todayStr = `${keyOf(TODAY).slice(5).replace("-","/")}（${WD[TODAY.getDay()]}）`;

  // ── レンダー ─────────────────────────────────────────
  if(loading) return (
    <div style={{ minHeight:"100vh",background:C.paper,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:SANS }}>
      <div style={{ width:40,height:40,borderRadius:"50%",border:`3px solid ${C.lineSoft}`,borderTopColor:C.q2,animation:"spin 0.8s linear infinite" }}/>
      <div style={{ fontSize:14,color:C.sub }}>Googleタスクを読み込み中…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(gasError) return (
    <div style={{ minHeight:"100vh",background:C.paper,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:SANS,padding:24 }}>
      <div style={{ fontSize:32 }}>⚠️</div>
      <div style={{ fontSize:15,fontWeight:700,color:C.ink }}>データ取得に失敗しました</div>
      <div style={{ fontSize:13,color:C.sub,maxWidth:360,textAlign:"center",lineHeight:1.6 }}>{gasError}</div>
      <button onClick={loadTasks} style={{ fontSize:14,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:11,padding:"11px 28px",cursor:"pointer" }}>再試行</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.paper, fontFamily:SANS, color:C.ink }}>
      <style>{`
        @keyframes p{0%,100%{opacity:1}50%{opacity:.45}}
        .pulse{animation:p 1.8s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.pulse{animation:none}}
        .scroll::-webkit-scrollbar{height:9px}
        .scroll::-webkit-scrollbar-thumb{background:#cdd6dc;border-radius:8px}
      `}</style>

      {/* ── ヘッダー ── */}
      <header style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#fff",borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,zIndex:10 }}>
        {/* タイトル＆日付（縦積み・タップで設定） */}
        <button onClick={()=>{setSubOpen(true);setSubView("polaris");}} style={{ display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1,background:"none",border:"none",cursor:"pointer",padding:"2px 4px",borderRadius:6 }}>
          <span style={{ fontFamily:MONO,fontSize:13,fontWeight:700,color:C.q2,letterSpacing:"-.01em",lineHeight:1.2 }}>Polaris</span>
          <span style={{ fontFamily:MONO,fontSize:11,color:C.sub,lineHeight:1.2 }}>{todayStr}</span>
        </button>
        {/* モードタブ */}
        <div style={{ display:"flex",gap:2,background:C.lineSoft,borderRadius:11,padding:3,flexShrink:0 }}>
          {[["focus","🎯 今日"],["plan","🗺️ 整理"]].map(([id,label])=>(
            <button key={id} onClick={()=>setView(id)} style={{ fontSize:12,fontWeight:700,padding:"5px 10px",borderRadius:8,cursor:"pointer",border:"none",color:view===id?C.ink:C.sub,background:view===id?"#fff":"transparent",boxShadow:view===id?"0 1px 3px #19232d14":"none",transition:"all .15s",whiteSpace:"nowrap" }}>{label}</button>
          ))}
        </div>
        {/* 今週やること */}
        <button onClick={()=>setReviewOpen(true)} style={{ display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:9,padding:"7px 11px",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap" }}><ListChecks size={13}/>今週やること</button>
      </header>

      {/* ── Focus ビュー ── */}
      {view==="focus"&&(
        <div style={{ maxWidth:520,margin:"0 auto",padding:"28px 18px 60px",display:"flex",flexDirection:"column",gap:20 }}>
          {/* キャプチャ入力 */}
          {HAS_GAS&&(
            <div style={{ background:"#fff",borderRadius:14,padding:"14px 16px",border:`1px solid ${C.line}` }}>
              <div style={{ display:"flex",gap:8 }}>
                <input value={capture} onChange={e=>{setCapture(e.target.value);setCaptureErr(null);}}
                  placeholder="今思いついたことを放り込む…" disabled={capturing}
                  style={{ flex:1,fontSize:14,color:C.ink,border:`1px solid ${C.line}`,borderRadius:10,padding:"10px 13px",background:"#fff",outline:"none",fontFamily:SANS }}/>
                <button onClick={handleCapture} disabled={capturing||!capture.trim()}
                  style={{ fontSize:13,fontWeight:700,color:"#fff",background:(capturing||!capture.trim())?C.sub:C.q2,border:"none",borderRadius:10,padding:"0 18px",cursor:capturing?"wait":"pointer",whiteSpace:"nowrap",transition:"background .15s" }}>
                  {capturing?"分類中…":"追加"}
                </button>
              </div>
              {captureErr&&<div style={{ fontSize:12,color:C.q1,marginTop:6 }}>{captureErr}</div>}
            </div>
          )}
          {/* 今日の一手 Hero */}
          {todayPick?<FocusCard t={todayPick.t} hero/>:(
            <div style={{ background:"#fff",borderRadius:16,padding:"28px 20px",textAlign:"center",border:`1px solid ${C.line}` }}>
              <Sun size={28} color={C.q2} style={{ marginBottom:10 }}/>
              <div style={{ fontSize:15,fontWeight:700,color:C.ink }}>進行中タスクがありません</div>
              <div style={{ fontSize:12,color:C.sub,marginTop:6 }}>整理モードでタスクを追加しましょう</div>
            </div>
          )}

          {/* 今週のコミット */}
          {committedList.length>0&&(
            <section style={{ background:"#fff",borderRadius:14,padding:"16px 16px 14px",border:`1px solid ${C.line}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                <Pin size={14} color={C.q2} fill={C.q2}/>
                <span style={{ fontSize:13,fontWeight:700 }}>今週のコミット</span>
                <span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{committedDone}/{committedList.length} 完了</span>
              </div>
              <div style={{ display:"flex",gap:6,marginBottom:12 }}>
                {committedList.map((_,i)=><span key={i} style={{ height:5,flex:1,borderRadius:3,background:i<committedDone?C.q2:C.lineSoft }}/>)}
              </div>
              {committedActive.length===0?(
                <div style={{ fontSize:13,color:C.q2,fontWeight:600,textAlign:"center",padding:"6px 0" }}>今週のコミットを全て完了！</div>
              ):(
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {committedActive.map(t=><FocusCard key={t.id} t={t}/>)}
                </div>
              )}
            </section>
          )}

          {/* 今日のタスク */}
          <section style={{ background:"#fff",borderRadius:14,padding:"16px 16px 14px",border:`1px solid ${C.line}` }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
              <Calendar size={14} color={C.sub}/>
              <span style={{ fontSize:13,fontWeight:700 }}>今日</span>
              <span style={{ fontFamily:MONO,fontSize:12,color:C.sub }}>{todayStr}</span>
              <span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{todayTasks.length}件</span>
            </div>
            {todayTasks.length===0?(
              <Empty text="今日が期限のタスクはありません。"/>
            ):(
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {todayTasks.map(t=><FocusCard key={t.id} t={t}/>)}
              </div>
            )}
          </section>

          {/* 直近（1〜3日以内＋→第1予告）*/}
          {(upcomingDays.length>0||approachList.length>0)&&(
            <section style={{ background:"#fff",borderRadius:14,border:`1px solid ${C.line}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,padding:"14px 16px 12px",borderBottom:`1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize:15 }}>⏰</span>
                <span style={{ fontSize:13,fontWeight:700 }}>直近</span>
                <span style={{ fontSize:11.5,color:C.sub,marginLeft:4 }}>今日から着手しないと間に合わないものも</span>
              </div>
              <div style={{ padding:"10px 16px 14px",display:"flex",flexDirection:"column",gap:14 }}>
                {upcomingDays.map(g=>(
                  <div key={g.key}>
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:7 }}>
                      <span style={{ fontFamily:MONO,fontSize:11,fontWeight:800,color:C.ink }}>{g.label}</span>
                      <span style={{ fontFamily:MONO,fontSize:11,color:C.sub }}>{g.key.slice(5).replace("-","/")}</span>
                      <span style={{ flex:1,height:1,background:C.lineSoft }}/>
                      <span style={{ fontFamily:MONO,fontSize:11,color:C.sub }}>{g.items.length}件</span>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                      {g.items.map(t=><FocusCard key={t.id} t={t}/>)}
                    </div>
                  </div>
                ))}
                {approachList.length>0&&(
                  <div>
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:7 }}>
                      <span className="pulse" style={{ fontFamily:MONO,fontSize:11,fontWeight:800,color:C.warn }}>→第1に迫っています</span>
                      <span style={{ flex:1,height:1,background:C.lineSoft }}/>
                      <span style={{ fontFamily:MONO,fontSize:11,color:C.sub }}>{approachList.length}件</span>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                      {approachList.map(t=><FocusCard key={t.id} t={t}/>)}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 💡 AIからの提案（モーダルを閉じた後も残っている提案） */}
          {!insightOpen&&calSuggestions.length>0&&(
            <section style={{ background:"#fff",borderRadius:14,padding:"14px 16px",border:`1px solid ${C.line}`,borderTop:`2px solid ${C.q2}` }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                <span style={{ fontSize:14 }}>💡</span>
                <span style={{ fontSize:13,fontWeight:700 }}>AIからの提案</span>
                <span style={{ fontFamily:MONO,fontSize:11,color:C.sub,marginLeft:4 }}>カレンダー分析</span>
                <button onClick={()=>setInsightOpen(true)} style={{ marginLeft:"auto",fontSize:11,color:C.q2,background:"none",border:"none",cursor:"pointer",textDecoration:"underline" }}>まとめて確認</button>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {calSuggestions.map((s,i)=>(
                  <div key={i} style={{ display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:C.paper,border:`1px solid ${C.line}`,borderRadius:10 }}>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:C.ink,lineHeight:1.4 }}>{s.suggestTitle}</div>
                      <div style={{ display:"flex",gap:7,marginTop:3,flexWrap:"wrap" }}>
                        <span style={{ fontSize:11,color:catColor(s.category),fontWeight:600 }}>{s.category}</span>
                        <span style={{ fontFamily:MONO,fontSize:11,color:C.sub }}>{s.deadlineDate}</span>
                        <span style={{ fontSize:11,color:C.sub,opacity:.8 }}>{s.reason}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:5,flexShrink:0 }}>
                      <button onClick={()=>approveSuggestion(s)} style={{ fontSize:11,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer" }}>追加</button>
                      <button onClick={()=>skipSuggestion(s)} style={{ fontSize:11,color:C.sub,background:"#fff",border:`1px solid ${C.line}`,borderRadius:7,padding:"5px 8px",cursor:"pointer" }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div style={{ textAlign:"center",fontSize:11,color:C.sub }}>{HAS_GAS?"Googleタスク接続済み":"GAS未接続 · サンプルデータ表示中"}</div>
        </div>
      )}

      {/* ── Plan ビュー ── */}
      {view==="plan"&&(
        <div style={{ padding:"20px 18px 40px" }}>
          {banner(diagBoard,"診断")}
          {/* フィルタ行 */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:10 }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
              <span style={{ fontSize:11,color:C.sub }}>状況で絞る</span>
              {TAGS.map(tg=><TagChip key={tg} name={tg}/>)}
              {tagFilter&&<button onClick={()=>setTagFilter(null)} style={{ fontSize:11,color:C.sub,background:"none",border:"none",cursor:"pointer",textDecoration:"underline" }}>解除</button>}
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:7,flexWrap:"wrap" }}>
              <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>{["すべて",...Object.keys(CAT)].map(n=><Chip key={n} name={n}/>)}</div>
              <div style={{ display:"flex",alignItems:"center",gap:6,background:"#fff",border:`1px solid ${C.line}`,borderRadius:10,padding:"5px 8px" }}>
                <span style={{ fontSize:11,color:C.sub }}>緊急とみなす</span>
                <button onClick={()=>setUrgentDays(v=>Math.max(1,v-1))} style={btn}>−</button>
                <span style={{ fontFamily:MONO,fontWeight:700,width:38,textAlign:"center" }}>{urgentDays}日</span>
                <button onClick={()=>setUrgentDays(v=>Math.min(14,v+1))} style={btn}>＋</button>
              </div>
            </div>
          </div>
          {/* 領域分布バー */}
          {total>0&&(
            <div style={{ background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:"10px 14px",marginBottom:14 }}>
              <div style={{ display:"flex",height:12,borderRadius:6,overflow:"hidden",gap:2,background:C.lineSoft,marginBottom:8 }}>
                {[1,2,3,4].map((n,i)=>tally[i]>0?<div key={n} title={`${QUAD[n].label} ${tally[i]}件`} style={{ width:`${(tally[i]/total)*100}%`,background:QUAD[n].color }}/>:null)}
              </div>
              <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}>
                {[1,2,3,4].map((n,i)=>(
                  <div key={n} style={{ display:"flex",alignItems:"center",gap:5 }}>
                    <span style={{ width:8,height:8,borderRadius:2,background:QUAD[n].color }}/>
                    <span style={{ fontSize:11,color:C.sub }}>{QUAD[n].label}</span>
                    <span style={{ fontFamily:MONO,fontSize:11,fontWeight:700,color:QUAD[n].color }}>{tally[i]}</span>
                    <span style={{ fontFamily:MONO,fontSize:10,color:C.sub }}>{Math.round((tally[i]/total)*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ボード本体 */}
          <div style={{ display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap" }}>
            <div style={{ flex:"1 1 300px",minWidth:270,display:"flex",flexDirection:"column",gap:14 }}>
              {/* 未スケジュール */}
              <section onDragOver={(e)=>{e.preventDefault();setOverCol("backlog");}} onDragLeave={()=>setOverCol(null)} onDrop={()=>{if(dragId!=null)place(dragId,null);setOverCol(null);setDragId(null);}} style={{ background:overCol==="backlog"?"#F0F8F6":"#fff",border:`1px solid ${C.line}`,borderRadius:14,padding:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                  <Inbox size={16} color={C.q2}/>
                  <span style={{ fontSize:14,fontWeight:700 }}>未スケジュール</span>
                  <span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{backlog.length}</span>
                </div>
                <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 12px",lineHeight:1.5 }}>重要だが日取り未定。赤枠は{AGING_DAYS}日以上停滞。右の週へ置く。</p>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {backlog.length===0&&<Empty text="未スケジュールはありません。"/>}
                  {backlog.map(t=><PlanCard key={t.id} t={t} mode="full"/>)}
                </div>
              </section>
              {/* 予定済み */}
              <section style={{ background:"#fff",border:`1px solid ${C.line}`,borderRadius:14,padding:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                  <Calendar size={16} color={C.q2}/>
                  <span style={{ fontSize:14,fontWeight:700 }}>予定済み（今週以降）</span>
                  <span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{scheduled.length}</span>
                </div>
                <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 12px",lineHeight:1.5 }}>日付が入った案件。7日より先の予定もここで確認・再設定できます。</p>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {scheduled.length===0&&<Empty text="予定済みはありません。"/>}
                  {scheduled.map(t=><PlanCard key={t.id} t={t} mode="full"/>)}
                </div>
              </section>
            </div>
            {/* 週カレンダー */}
            <section style={{ flex:"3 1 560px",minWidth:300 }}>
              <div className="scroll" style={{ overflowX:"auto",paddingBottom:6 }}>
                <div style={{ minWidth:826,background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,overflow:"hidden" }}>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))" }}>
                    {week.map(day=>{
                      const isToday=day.i===0,horizon=!isToday&&day.i<=urgentDays-1;
                      const wdColor=day.dow===0?C.q1:day.dow===6?"#2D6CDF":C.sub;
                      return(
                        <div key={day.key} style={{ padding:"8px 0 9px",textAlign:"center",borderLeft:day.i?`1px solid ${C.lineSoft}`:"none",borderBottom:`1px solid ${C.line}`,boxShadow:horizon?`inset 0 -3px 0 ${C.warn}`:"none" }}>
                          <div style={{ fontSize:11,fontWeight:600,color:wdColor }}>{day.wd}</div>
                          <div style={{ margin:"3px auto 0",width:30,height:30,borderRadius:"50%",display:"grid",placeItems:"center",background:isToday?C.q2:"transparent",color:isToday?"#fff":C.ink }}>
                            <span style={{ fontFamily:MONO,fontSize:16,fontWeight:800 }}>{day.dom}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",minHeight:300 }}>
                    {week.map(day=>{
                      const isToday=day.i===0,over=overCol===day.key,items=dayTasks(day.key);
                      return(
                        <div key={day.key} onClick={()=>onTapTarget(day.key)} onDragOver={(e)=>{e.preventDefault();setOverCol(day.key);}} onDragLeave={()=>setOverCol(null)} onDrop={()=>{if(dragId!=null)place(dragId,day.key);setOverCol(null);setDragId(null);}}
                          style={{ borderLeft:day.i?`1px solid ${C.lineSoft}`:"none",background:over?"#EAF5F3":isToday?C.todayTint:"#fff",padding:6,minWidth:0,cursor:selected!=null?"copy":"default",display:"flex",flexDirection:"column",gap:5 }}>
                          {items.map(t=><PlanCard key={t.id} t={t} mode="bar"/>)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <p style={{ fontSize:11,color:C.sub,marginTop:10,lineHeight:1.5 }}>
                カードをタップ → 置きたい日をタップで確定（スマホ）。PCはドラッグ＆ドロップ。外枠の色が象限（赤＝第1/橙＝第3/ティール＝第2/グレー＝第4）。
              </p>
            </section>
          </div>
        </div>
      )}

      {/* ── サブメニュー モーダル ── */}
      {subOpen&&(
        <div onClick={()=>setSubOpen(false)} style={{ position:"fixed",inset:0,background:"#19232d70",display:"grid",placeItems:"center",padding:18,zIndex:40 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:"100%",maxWidth:720,maxHeight:"88vh",overflow:"auto",background:"#fff",borderRadius:18,boxShadow:"0 8px 32px #19232d28",display:"flex",flexDirection:"column" }}>
            {/* サブメニューヘッダ */}
            <div style={{ display:"flex",alignItems:"center",gap:2,padding:"14px 16px 12px",borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,background:"#fff" }}>
              <div style={{ display:"flex",gap:2,background:C.lineSoft,borderRadius:10,padding:3,flex:1 }}>
                {[["quad","領域別"],["review","ふりかえり"],["hold","保留"],["polaris","★ Polaris"]].map(([id,label])=>(
                  <button key={id} onClick={()=>setSubView(id)} style={{ flex:1,fontSize:12,fontWeight:700,padding:"6px 8px",borderRadius:7,cursor:"pointer",border:"none",color:subView===id?C.ink:C.sub,background:subView===id?"#fff":"transparent",boxShadow:subView===id?"0 1px 2px #19232d12":"none" }}>{label}</button>
                ))}
              </div>
              <button onClick={()=>setSubOpen(false)} style={{ ...miniBtn,width:30,height:30,marginLeft:10 }} aria-label="閉じる"><X size={16}/></button>
            </div>
            {/* サブメニューコンテンツ */}
            <div style={{ padding:16,flex:1 }}>
              {/* 領域別 */}
              {subView==="quad"&&(
                <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
                  {[1,2,3,4].map(n=>{
                    const items=tasks.filter(t=>isActive(t)&&visible(t)&&quadrantOf(t)===n).sort((a,b)=>{const da=daysUntil(a.due),db=daysUntil(b.due);if(da===null&&db===null)return 0;if(da===null)return 1;if(db===null)return -1;return da-db;});
                    const meta=QUAD[n];
                    return(
                      <div key={n} style={{ flex:"1 1 300px",minWidth:260,background:"#fff",border:`1px solid ${C.line}`,borderTop:`3px solid ${meta.color}`,borderRadius:12,padding:12 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:10 }}>
                          <span style={{ fontFamily:MONO,fontSize:12,fontWeight:800,color:meta.color }}>{meta.label}</span>
                          <span style={{ fontSize:12,fontWeight:600,color:C.ink }}>{meta.name}</span>
                          <span style={{ fontFamily:MONO,fontSize:11,color:C.sub,marginLeft:"auto" }}>{items.length}</span>
                        </div>
                        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                          {items.length===0&&<Empty text="なし"/>}
                          {items.map(t=><PlanCard key={t.id} t={t} mode="bar"/>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* ふりかえり */}
              {subView==="review"&&(
                <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}>
                  <div style={{ flex:"1 1 240px",minWidth:220 }}>
                    {banner(diagReview,"振り返り診断")}
                    <div style={{ background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:14 }}>
                      <div style={{ fontSize:12,color:C.sub,marginBottom:2 }}>第2領域 完了比率</div>
                      <div style={{ display:"flex",alignItems:"baseline",gap:3,marginBottom:14 }}>
                        <span style={{ fontFamily:MONO,fontSize:44,fontWeight:800,color:C.q2,lineHeight:1 }}>{q2share}</span>
                        <span style={{ fontFamily:MONO,fontSize:18,fontWeight:800,color:C.q2 }}>%</span>
                      </div>
                      {[1,2,3,4].map((n,i)=>{
                        const pct=ctotal?Math.round((cdist[i]/ctotal)*100):0;
                        return(
                          <div key={n} style={{ marginBottom:10 }}>
                            <div style={{ display:"flex",gap:6,marginBottom:3 }}>
                              <span style={{ fontFamily:MONO,fontSize:10.5,fontWeight:800,color:QUAD[n].color }}>{QUAD[n].label}</span>
                              <span style={{ fontSize:10.5,color:C.sub }}>{QUAD[n].name}</span>
                              <span style={{ fontFamily:MONO,fontSize:10.5,color:C.ink,marginLeft:"auto" }}>{cdist[i]}件 · {pct}%</span>
                            </div>
                            <div style={{ height:7,borderRadius:5,background:C.lineSoft,overflow:"hidden" }}>
                              <div style={{ height:"100%",width:`${pct}%`,background:QUAD[n].color,borderRadius:5,transition:"width .3s" }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:14,marginTop:12 }}>
                      <div style={{ fontSize:13,fontWeight:700,marginBottom:8 }}>第2領域 完了率の推移</div>
                      <TrendChart data={[...TREND_BASE,{w:"今週",v:q2share}]}/>
                    </div>
                  </div>
                  <div style={{ flex:"2 1 340px",minWidth:280,background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:14 }}>
                    <div style={{ fontSize:13,fontWeight:700,marginBottom:12 }}>完了したタスク</div>
                    <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                      {ctotal===0&&<Empty text="完了タスクはまだありません。"/>}
                      {[...completed].sort((a,b)=>a.doneAt<b.doneAt?1:-1).map(t=>{
                        const meta=QUAD[t.doneQuadrant];
                        return(
                          <div key={t.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 11px",border:`1px solid ${C.line}`,borderLeft:`3px solid ${meta.color}`,borderRadius:9 }}>
                            <span style={{ fontFamily:MONO,fontSize:11,fontWeight:800,color:meta.color,flexShrink:0 }}>{meta.label}</span>
                            <div style={{ flex:1,minWidth:0 }}>
                              <div style={{ fontSize:13,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{t.title}</div>
                              <div style={{ display:"flex",gap:7,marginTop:3 }}>
                                <span style={{ fontSize:10.5,color:CAT[t.cat],fontWeight:600 }}>{t.cat}</span>
                                <span style={{ fontFamily:MONO,fontSize:10.5,color:C.sub }}>{t.doneAt.slice(5).replace("-","/")} 完了</span>
                              </div>
                            </div>
                            <button onClick={()=>toggleDone(t.id)} style={{ flexShrink:0,display:"flex",alignItems:"center",gap:4,fontSize:11,color:C.sub,background:"#fff",border:`1px solid ${C.line}`,borderRadius:7,padding:"4px 8px",cursor:"pointer" }}><RotateCcw size={12}/>戻す</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {/* 保留 */}
              {subView==="hold"&&(
                <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}>
                  <div style={{ flex:"1 1 300px",minWidth:260 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:12 }}><Pause size={15} color={C.q3}/><span style={{ fontSize:13,fontWeight:700 }}>待ち</span><span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{waitingList.length}</span></div>
                    <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 12px",lineHeight:1.5 }}>自分では動けない案件。先方から動きがあれば「ボードへ」。</p>
                    <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                      {waitingList.length===0&&<Empty text="待ちはありません。"/>}
                      {waitingList.map(t=><HoldRow key={t.id} t={t} kind="wait"/>)}
                    </div>
                  </div>
                  <div style={{ flex:"1 1 300px",minWidth:260 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:12 }}><Archive size={15} color={C.sub}/><span style={{ fontSize:13,fontWeight:700 }}>Someday</span><span style={{ fontFamily:MONO,fontSize:12,color:C.sub,marginLeft:"auto" }}>{somedayList.length}</span></div>
                    <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 12px",lineHeight:1.5 }}>「いつかやりたい」を週次の視界から外す棚。やる気になったら「ボードへ」。</p>
                    <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                      {somedayList.length===0&&<Empty text="Somedayはありません。"/>}
                      {somedayList.map(t=><HoldRow key={t.id} t={t} kind="someday"/>)}
                    </div>
                  </div>
                </div>
              )}
              {/* Polaris */}
              {subView==="polaris"&&(
                <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}>
                  <section style={{ flex:"1 1 300px",minWidth:270,background:"#fff",border:`1px solid ${C.line}`,borderTop:`3px solid ${C.q2}`,borderRadius:12,padding:16 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2 }}>
                      <Star size={14} color={C.q2} fill={C.q2}/>
                      <span style={{ fontFamily:MONO,fontSize:10,letterSpacing:".14em",color:C.sub }}>POLARIS · 北極星</span>
                    </div>
                    <h2 style={{ fontSize:15,fontWeight:800,margin:"2px 0 4px" }}>人生・仕事の方向性</h2>
                    <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 14px",lineHeight:1.6 }}>すべての判断の最上位基準。具体的に書くほどAI判定が安定します。</p>
                    <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:12 }}>
                      {polaris.length===0&&<Empty text="方向性が未設定です。"/>}
                      {polaris.map(x=>(
                        <div key={x.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:`1px solid ${C.line}`,borderLeft:`3px solid ${C.q2}`,borderRadius:9 }}>
                          <Star size={12} color={C.q2} style={{ flexShrink:0 }}/>
                          <span style={{ flex:1,minWidth:0,fontSize:13,color:C.ink,lineHeight:1.4 }}>{x.text}</span>
                          <button onClick={()=>delPolaris(x.id)} style={miniBtn}><X size={13}/></button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex",gap:8 }}>
                      <input value={polarisInput} onChange={(e)=>setPolarisInput(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")addPolaris();}} placeholder="例：予防で患者の一生を支える" style={{ flex:1,minWidth:0,fontSize:13,color:C.ink,border:`1px solid ${C.line}`,borderRadius:9,padding:"9px 11px",background:"#fff" }}/>
                      <button onClick={addPolaris} style={{ fontSize:13,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:9,padding:"0 16px",cursor:"pointer" }}>追加</button>
                    </div>
                    {HAS_GAS&&(
                      <div style={{ marginTop:16,paddingTop:14,borderTop:`1px solid ${C.lineSoft}` }}>
                        <button onClick={()=>runCalendarFetch(true)} disabled={insightLoading} style={{ width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:13,fontWeight:600,color:insightLoading?C.sub:C.ink,background:C.lineSoft,border:`1px solid ${C.line}`,borderRadius:10,padding:"10px",cursor:insightLoading?"default":"pointer" }}>
                          {insightLoading?"🔄 取得中…":"🔄 AIカレンダー提案を手動取得"}
                        </button>
                        {calSuggestions.length>0&&<div style={{ fontSize:11,color:C.sub,textAlign:"center",marginTop:6 }}>現在 {calSuggestions.length} 件の提案がキャッシュ済み</div>}
                      </div>
                    )}
                  </section>
                  <section style={{ flex:"1 1 300px",minWidth:270,background:"#fff",border:`1px solid ${C.line}`,borderRadius:12,padding:16 }}>
                    <h2 style={{ fontSize:15,fontWeight:800,margin:"0 0 4px" }}>方向性との整合チェック</h2>
                    <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 14px",lineHeight:1.6 }}>進行中の全タスクを方向性に照らし、AIが「沿う／やや／ズレ」を判定します。</p>
                    <button onClick={runAlignment} disabled={checking} style={{ width:"100%",fontSize:14,fontWeight:700,color:"#fff",background:checking?C.sub:C.ink,border:"none",borderRadius:11,padding:"11px",cursor:checking?"default":"pointer" }}>{checking?"判定中…":"AIで全タスクをチェック"}</button>
                    {checkErr&&<div style={{ fontSize:12,color:C.q1,marginTop:10,lineHeight:1.5 }}>{checkErr}</div>}
                    {alignList.length>0&&(
                      <>
                        <div style={{ display:"flex",gap:12,marginTop:14,marginBottom:12 }}>
                          {["on","weak","off"].map(kk=>(
                            <div key={kk} style={{ display:"flex",alignItems:"center",gap:5 }}>
                              <span style={{ width:9,height:9,borderRadius:2,background:ALIGN[kk].color }}/>
                              <span style={{ fontSize:11,color:C.sub }}>{ALIGN[kk].label}</span>
                              <span style={{ fontFamily:MONO,fontSize:11,fontWeight:700,color:ALIGN[kk].color }}>{alignCount[kk]}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize:12,fontWeight:700,color:C.ink,marginBottom:8 }}>方向性から外れ気味のタスク</div>
                        <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                          {offList.length===0&&<Empty text="全タスクが方向性に沿っています。"/>}
                          {offList.map(t=>{
                            const a=ALIGN[align[t.id].align];
                            return(
                              <div key={t.id} style={{ display:"flex",alignItems:"center",gap:9,padding:"8px 10px",border:`1px solid ${C.line}`,borderLeft:`3px solid ${a.color}`,borderRadius:9 }}>
                                <span style={{ fontSize:10,fontWeight:700,color:a.color,background:a.bg,padding:"1px 6px",borderRadius:5,flexShrink:0 }}>{a.label}</span>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ fontSize:13,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{t.title}</div>
                                  <div style={{ fontSize:10.5,color:C.sub,marginTop:2 }}>{t.cat} · {align[t.id].why}</div>
                                </div>
                                <button onClick={()=>toggleField(t.id,"someday")} style={miniBtn} title="Somedayへ"><Archive size={12}/></button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <p style={{ fontSize:10.5,color:C.sub,marginTop:14,lineHeight:1.6 }}>判定はClaudeをその場で呼び出します（claude.ai上で動作）。あくまで気づきの補助。</p>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 週次レビュー オーバーレイ ── */}
      {reviewOpen&&(
        <div onClick={()=>setReviewOpen(false)} style={{ position:"fixed",inset:0,background:"#19232d80",display:"grid",placeItems:"center",padding:18,zIndex:50 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:"100%",maxWidth:460,maxHeight:"85vh",overflow:"auto",background:"#fff",borderRadius:16,padding:20 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
              <ListChecks size={18} color={C.q2}/>
              <h2 style={{ fontSize:17,fontWeight:800,margin:0 }}>今週のレビュー</h2>
              <button onClick={()=>setReviewOpen(false)} style={{ ...miniBtn,marginLeft:"auto",width:26,height:26 }}><X size={16}/></button>
            </div>
            <p style={{ fontSize:12,color:C.sub,margin:"0 0 14px",lineHeight:1.6 }}>
              未スケジュールの第2案件から、<b style={{ color:C.ink }}>今週やる3つ</b>を選んでください。
              <span style={{ fontFamily:MONO,color:C.q2,fontWeight:700,marginLeft:6 }}>{committedList.length}/3</span>
            </p>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {reviewCands.length===0&&<Empty text="未スケジュールの第2案件はありません。"/>}
              {reviewCands.map(t=>{
                const on=!!t.committed,full=committedList.length>=3&&!on;
                return(
                  <button key={t.id} disabled={full} onClick={()=>setCommitted(t.id,!on)}
                    style={{ textAlign:"left",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,cursor:full?"not-allowed":"pointer",opacity:full?0.45:1,background:on?"#EAF5F3":"#fff",border:`1.5px solid ${on?C.q2:C.line}` }}>
                    <span style={{ width:20,height:20,borderRadius:6,border:`1.5px solid ${on?C.q2:C.line}`,background:on?C.q2:"#fff",display:"grid",placeItems:"center",flexShrink:0 }}>{on&&<Check size={13} color="#fff"/>}</span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{t.title}</div>
                      <div style={{ fontSize:10.5,color:C.sub,marginTop:2 }}>{t.cat} · {t.span}{isAging(t)?` · 停滞${ageDays(t.createdAt)}日`:""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={()=>setReviewOpen(false)} style={{ width:"100%",marginTop:16,fontSize:14,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:11,padding:"11px",cursor:"pointer" }}>
              この{committedList.length}件を今週のコミットにする
            </button>
          </div>
        </div>
      )}

      {/* ── Polaris Insight モーダル ── */}
      {insightOpen&&calSuggestions.length>0&&(
        <div onClick={()=>setInsightOpen(false)} style={{ position:"fixed",inset:0,background:"#19232d70",display:"grid",placeItems:"center",padding:18,zIndex:60 }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxWidth:460,maxHeight:"85vh",overflow:"auto",background:"#fff",borderRadius:18,boxShadow:"0 8px 32px #19232d28",display:"flex",flexDirection:"column" }}>
            <div style={{ padding:"18px 18px 14px",borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,background:"#fff" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:2 }}>
                <span style={{ fontSize:18 }}>✨</span>
                <span style={{ fontSize:15,fontWeight:800,color:C.ink }}>Polaris Insight</span>
                <button onClick={()=>setInsightOpen(false)} style={{ ...miniBtn,marginLeft:"auto",width:28,height:28 }}><X size={15}/></button>
              </div>
              <p style={{ fontSize:12,color:C.sub,margin:0,lineHeight:1.6 }}>カレンダーの予定から、事前に着手すべき第2領域タスクをAIが提案しています。</p>
            </div>
            <div style={{ padding:"14px 16px",display:"flex",flexDirection:"column",gap:10,flex:1 }}>
              {calSuggestions.map((s,i)=>(
                <div key={i} style={{ background:C.paper,border:`1px solid ${C.line}`,borderLeft:`3px solid ${C.q2}`,borderRadius:11,padding:"12px 14px" }}>
                  <div style={{ fontSize:14,fontWeight:700,color:C.ink,lineHeight:1.4,marginBottom:5 }}>{s.suggestTitle}</div>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
                    <span style={{ fontSize:11,color:catColor(s.category),fontWeight:700,background:`${catColor(s.category)}16`,padding:"2px 8px",borderRadius:20 }}>{s.category}</span>
                    <span style={{ fontFamily:MONO,fontSize:11,color:C.sub }}>期日: {s.deadlineDate}</span>
                  </div>
                  <p style={{ fontSize:11.5,color:C.sub,margin:"0 0 10px",lineHeight:1.5 }}>{s.reason}</p>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={()=>approveSuggestion(s)} style={{ flex:1,fontSize:13,fontWeight:700,color:"#fff",background:C.q2,border:"none",borderRadius:9,padding:"8px",cursor:"pointer" }}>+ タスクに追加</button>
                    <button onClick={()=>skipSuggestion(s)} style={{ fontSize:13,fontWeight:600,color:C.sub,background:"#fff",border:`1px solid ${C.line}`,borderRadius:9,padding:"8px 14px",cursor:"pointer" }}>スキップ</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:"12px 16px",borderTop:`1px solid ${C.line}`,position:"sticky",bottom:0,background:"#fff" }}>
              <button onClick={()=>setInsightOpen(false)} style={{ width:"100%",fontSize:13,fontWeight:700,color:C.ink,background:C.lineSoft,border:"none",borderRadius:10,padding:"10px",cursor:"pointer" }}>後で決める</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ローディングトースト ── */}
      {insightLoading&&(
        <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#fff",border:`1px solid ${C.line}`,borderRadius:20,padding:"8px 16px",fontSize:12,color:C.sub,boxShadow:"0 2px 10px #19232d18",zIndex:60,whiteSpace:"nowrap",pointerEvents:"none" }}>
          🧭 カレンダーを分析中…
        </div>
      )}
    </div>
  );
}
