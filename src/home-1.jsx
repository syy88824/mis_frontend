import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/** ==========================
 *  GitHub raw JSON（請自行填入）
 *  ========================== */
export const LABELS_JSON = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json"; // e.g. https://raw.githubusercontent.com/<user>/<repo>/main/labels.json
export const ANY_DATA_JSON_WITH_TRUE_LABELS = ""; // 若無 labels.json，可由資料集的 "true_label" 收集
// ✨ 新增：可選擇由 URL 匯入資料進「模型待訓練資料」（僅示意，格式盡量包含 filename / pred / true_label）
export const DATASET_JSON_URL = "https://raw.githubusercontent.com/syy88824/mis_frontend/refs/heads/master/pred_label.json";

/** ==========================
 *  調色盤（你提供的 24 色）
 *  ========================== */
export const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];
const assignColors = (labels) => {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
};
function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800"><a href="/"> Malvec</a></div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li><a href="#about" className="hover:text-blue-500">About us</a></li>
          <li><a href="./evaluation" className="hover:text-blue-500">Evaluation</a></li>
          <li><a href="#tech" className="hover:text-blue-500">Techniques</a></li>
        </ul>
      </nav>
    </header>
  );
}

/** ----------------- Animated Bullets ----------------- */
function AnimatedBullets({ items, playKey, title }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (playKey === -1) { setVisibleCount(0); return; } // 清空
    if (!playKey || !items?.length) return;             // 不動
    setVisibleCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleCount(v => Math.min(items.length, v + 1));
      if (i >= items.length) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [items, playKey]);

  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
      <ul className="list-disc pl-6 text-sm text-slate-700 min-h-[4rem]">
        {items.slice(0, visibleCount).map((t, idx) => (
          <li key={idx} className="mb-1">{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** ----------------- CircleProgress ----------------- */
function CircleProgress({ durationSec, status, onDone, size = 64 }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  // 顏色：idle 灰、active 藍動畫、done 藍實心
  const baseStroke = status === "idle" ? "#e5e7eb" : "#3b82f6";
  const animate = status === "active";

  useEffect(() => {
    if (!animate) { setOffset(status === "done" ? 0 : circumference); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (durationSec * 1000));
      setOffset(circumference * (1 - t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onDone?.(); // 單顆完成
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, durationSec, circumference, onDone, status]);

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="mx-auto">
      <circle cx="40" cy="40" r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
      <circle
        cx="40" cy="40" r={radius}
        stroke={baseStroke} strokeWidth="8" fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
    </svg>
  );
}

/** ----------------- Pagination (20/頁) ----------------- */
const PAGE_SIZE = 5;
function usePagination(list) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((list?.length || 0) / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return (list || []).slice(start, start + PAGE_SIZE);
  }, [list, page]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  return { page, setPage, totalPages, pageItems };
}
function Pager({ page, setPage, totalPages, labelPrefix, totalText }) {
  const startIdx = (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(page * PAGE_SIZE, page * PAGE_SIZE); // 顯示固定區間格式
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <div className="text-slate-600">{labelPrefix} 第{startIdx}-{endIdx}筆資料，{totalText}</div>
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 rounded border"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          上一頁
        </button>
        第<select

          className="border rounded px-2 py-1"
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span>/ {totalPages}頁</span>

        <button
          className="px-2 py-1 rounded border"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  useEffect(() => { document.title = "File Uploading"; }, []);
  /** ===== 讀取 labels ===== */
  const [labelChoices, setLabelChoices] = useState([]);
  const colors = useMemo(() => assignColors(labelChoices), [labelChoices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (LABELS_JSON) {
          const r = await fetch(LABELS_JSON);
          const js = await r.json();
          const arr = Array.isArray(js) ? js : (Array.isArray(js.labels) ? js.labels : []);
          if (!cancelled && arr?.length) setLabelChoices([...new Set(arr.map(String))]);
        } else if (ANY_DATA_JSON_WITH_TRUE_LABELS) {
          const r = await fetch(ANY_DATA_JSON_WITH_TRUE_LABELS);
          const js = await r.json();
          const uni = new Set();
          (Array.isArray(js) ? js : []).forEach(row => {
            const k = row["true label"] ?? row["true_label"];
            if (k) uni.add(String(k));
          });
          if (!cancelled && uni.size) setLabelChoices([...uni]);
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, []);

  /** ===== 佇列（修正批次顯示） ===== */
  const [activeQueue, setActiveQueue] = useState([]);   // 目前批次
  const [pendingQueue, setPendingQueue] = useState([]); // 下一批
  const [processing, setProcessing] = useState(false);
  const [currentBatchTotal, setCurrentBatchTotal] = useState(0);
  const [lastBatchTotal, setLastBatchTotal] = useState(0);

  /** ===== Bullets & Circles 狀態 ===== */
  const bulletItems = ["PE 32-file", "is .exe", "is UPX compressed"];
  const [bulletPlayKey, setBulletPlayKey] = useState(0);   // >0 播放；-1 清空；0 保持
  const [bulletsDone, setBulletsDone] = useState(false);   // 一次播放完成
  const [circleStep, setCircleStep] = useState(0);         // 0=尚未開始, 1..N=第幾顆在跑
  const [circleDone, setCircleDone] = useState([false, false, false, false]); // 4 顆

  /** ===== 模型待訓練資料 ===== */
  const [trainRows, setTrainRows] = useState([]);
  const [canTrainEnabled, setCanTrainEnabled] = useState(false); // ✨ 初始 disabled，檔案分析完才啟用
  const nextId = useRef(1);

  // ✨ 新增：從 URL 匯入資料（若有設定 DATASET_JSON_URL）
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!DATASET_JSON_URL) return;
      try {
        const r = await fetch(DATASET_JSON_URL, { cache: "no-store" });
        const js = await r.json();
        const arr = Array.isArray(js) ? js : [js];
        const rows = arr.map((it, i) => ({
          id: nextId.current++,
          filename: String(it.filename || `sample_${i}.exe`),
          pred: String(it.pred_label || "unknown"),
          trueLabel: String(it.true_label || "-"),
          provision: it.true_label || "",
          finetuned: false,
        }));
        if (!aborted) setTrainRows(prev => [...rows, ...prev]);
      } catch (e) { /* ignore */ }
    })();
    return () => { aborted = true; };
  }, []);

  const randomPred = (filename) => {
    if (!labelChoices || !labelChoices.length) return "unknown";
    if (filename.toLowerCase().includes("738cfa86c6b8263638afc7a51ee41863")) {
      return "WORM.AUTOIT";
    } else if (filename.toLowerCase().startsWith("dogwaffle")) {
      return "GOODWARE";
    }
    return labelChoices[Math.floor(Math.random() * labelChoices.length)];
  };

  /** ===== 上傳（分批） ===== */
  const NOISE_NAMES = new Set(["desktop.ini", ".ds_store", "thumbs.db"]);
  const ALLOWED_EXT = /(\.exe)$/i;
  const isSystemNoise = (file) => NOISE_NAMES.has((file?.name || "").toLowerCase());
  const isAllowedExt = (file) => ALLOWED_EXT.test(file?.name || "");

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const toProcess = files.filter(f => !isSystemNoise(f) && isAllowedExt(f));
    if (!toProcess.length) {
      window.alert("沒有可處理的檔案（已忽略 desktop.ini 等非 exe 檔）。");
      return;
    }
    if (!processing && activeQueue.length === 0) {
      setActiveQueue(toProcess);
      setCurrentBatchTotal(toProcess.length);
      setLastBatchTotal(toProcess.length);
      startNextFile(toProcess[0]);
    } else {
      setPendingQueue(prev => prev.concat(toProcess));
    }
  };
  const onInputChange = (e) => handleFiles(e.target.files);
  const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  /** ===== 開始處理下一個檔案（先播 bullets；完成後才啟動 circles） ===== */
  const startNextFile = (file) => {
    if (!file) return;
    setProcessing(true);
    setBulletsDone(false);
    setCircleStep(0);
    setCircleDone([false, false, false, false]);
    setBulletPlayKey(k => k + 1);
    const totalMs = bulletItems.length * 3000 + 2000;
    setTimeout(() => {
      setBulletsDone(true);
      setCircleStep(1);
    }, totalMs);
  };

  /** ===== 單顆 circle 完成 ===== */
  const handleCircleDone = (idx) => {
    setCircleDone(prev => {
      const next = prev.slice();
      next[idx] = true;
      return next;
    });
    if (idx < 3) {
      setCircleStep(idx + 2); // 下一顆開始
    } else {
      // 四顆都完成：加入表格
      const file = activeQueue[0];
      if (file) {
        const id = nextId.current++;
        setTrainRows(prev => [{ id, filename: file.name, pred: randomPred(file.name), trueLabel: "-", provision: "", finetuned: false }, ...prev]);
      }
      // 提示並開啟可訓練
      if (!canTrainEnabled) {
        window.alert("Your analyzed data has reached a sufficient amount for fine-tuning the model.");
        setCanTrainEnabled(true);
      }

      // 清空 bullets 與圈圈
      setBulletPlayKey(-1);
      setCircleStep(0);
      setCircleDone([false, false, false, false]);

      // 切到下一個檔案/批次
      setActiveQueue(prev => {
        const rest = prev.slice(1);
        if (rest.length > 0) {
          setProcessing(false);
          setTimeout(() => startNextFile(rest[0]), 0);
        } else {
          setProcessing(false);
          if (pendingQueue.length > 0) {
            const nextBatch = pendingQueue.slice();
            setPendingQueue([]);
            setActiveQueue(nextBatch);
            setCurrentBatchTotal(nextBatch.length);
            setLastBatchTotal(nextBatch.length);
            setTimeout(() => startNextFile(nextBatch[0]), 0);
          } else {
            setCurrentBatchTotal(0);
          }
        }
        return rest;
      });
    }
  };

  /** ===== Training modal pool（隨機抽取 1/5，排除 finetuned） ===== */
  const [trainOpen, setTrainOpen] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainCircleKey, setTrainCircleKey] = useState(0);
  const [trainPool, setTrainPool] = useState([]); // 顯示在 modal 的 1/5 抽樣

  const openTraining = () => {
    // 從未 finetuned 的資料中抽 1/5
    const candidates = trainRows.filter(r => !r.finetuned);
    const pickCount = Math.max(0, Math.floor(candidates.length / 5));
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const sampled = shuffled.slice(0, pickCount);
    setTrainPool(sampled);
    setTrainOpen(true);
  };

  // Modal 內全數皆需有 true_label 才能訓練
  const allModalLabeled = useMemo(() => trainPool.length > 0 && trainPool.every(r => r.trueLabel && r.trueLabel !== "-"), [trainPool]);

  const startTraining = () => {
    if (!allModalLabeled) return; // 保護
    setTraining(true);
    setTrainCircleKey(k => k + 1);
    setTimeout(() => {
      // 訓練完成：把目前「模型待訓練資料」的資料都打勾 finetuned
      setTrainRows(prev => prev.map(r => ({ ...r, finetuned: true })));
      setTraining(false);
      setTrainOpen(false);
      setTrainPool([]);
      setCanTrainEnabled(false); // 訓練後暫時關閉，等待下次新分析資料
    }, 10000);
  };

  /** ===== 批次匯入 true label（移到 modal） ===== */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkError, setBulkError] = useState("");

  const applyBulkJsonToModal = (entries) => {
    // 只更新 modal pool 中的 trueLabel
    setTrainPool(prev => prev.map(row => {
      const hit = entries.find(e => e.filename === row.filename);
      if (!hit) return row;
      const v = hit.true_label;
      return { ...row, trueLabel: v, provision: v };
    }));
  };

  const parseBulk = async () => {
    try {
      setBulkError("");
      let text = bulkText.trim();
      if (bulkFile) text = await (bulkFile?.text?.() || "");
      if (!text) return;
      let data = JSON.parse(text);
      if (!Array.isArray(data)) data = [data];
      const entries = [];
      for (const it of data) {
        if (it && typeof it === "object" && "filename" in it && "true_label" in it) {
          entries.push({ filename: String(it.filename), true_label: String(it.true_label) });
        }
      }
      if (!entries.length) throw new Error("Empty or invalid JSON format.");
      applyBulkJsonToModal(entries);
      setBulkOpen(false); setBulkText(""); setBulkFile(null);
    } catch {
      setBulkError("JSON 解析失敗，請確認格式為：[{\"filename\":\"xxx.exe\",\"true_label\":\"trojan\"}, ...]");
    }
  };

  /** ===== 批次計數顯示 ===== */
  const remaining = activeQueue.length > 0 ? activeQueue.length : 0;
  const total = activeQueue.length > 0 ? currentBatchTotal : lastBatchTotal;

  /** ===== 版面配置 ===== */
  const currentFile = activeQueue[0];
  const bulletsTitle = currentFile ? `${currentFile.name} has…` : "等待處理的檔案…";
  const navigate = useNavigate();

  // Pagination — 主表（模型待訓練資料）
  const { page: mainPage, setPage: setMainPage, totalPages: mainTotalPages, pageItems: mainPageItems } = usePagination(trainRows);
  // Pagination — Modal 表
  const { page: modalPage, setPage: setModalPage, totalPages: modalTotalPages, pageItems: modalPageItems } = usePagination(trainPool);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopBar />

      <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 xl:grid-cols-3">
        {/* 第一列：Upload（span 2） + Bullets（span 1） */}
        <section
          className="xl:col-span-2 border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white shadow-sm"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Upload .exe (single/multiple or whole folder)</h2>
            <div className="text-xs text-slate-500">支援多檔與整個資料夾上傳（僅限 .exe）</div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" id="folderInput" onChange={onInputChange} />
            <label htmlFor="folderInput" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
              Select folder
            </label>

            <input type="file" accept=".exe" multiple id="filesInput" className="hidden" onChange={onInputChange} />
            <label htmlFor="filesInput" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">
              Select executables
            </label>

            <span className="text-sm text-slate-500">或直接把資料夾/檔案拖曳到此區</span>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            {total ? `待處理檔案數：${remaining} / ${total}` : "尚未選擇檔案"}
          </div>
        </section>

        <div className="xl:col-span-1">
          <AnimatedBullets
            items={bulletItems}
            playKey={processing && !bulletsDone ? bulletPlayKey : (processing ? bulletPlayKey : 0)}
            title={bulletsTitle}
          />
        </div>

        {/* 第二列：Progress（span 3） */}
        <section className="xl:col-span-3 bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Processing (per file)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {["Disassembling", "Malware Family Identification", "Attention Heatmap Visualization", "SOM Analyzing"].map((label, i) => {
              const idx = i; // 0..3
              const status =
                circleStep === 0 ? (circleDone[idx] ? "done" : "idle")
                  : (idx + 1 < circleStep ? "done" : (idx + 1 === circleStep ? "active" : "idle"));
              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <CircleProgress
                    durationSec={5}
                    status={status}
                    onDone={() => status === "active" && handleCircleDone(idx)}
                  />
                  <div className="text-slate-700 text-sm">{label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-slate-500">{processing ? currentFile?.name : ""}</div>
        </section>

        {/* 第三列：模型待訓練資料（span 3） */}
        <section className="xl:col-span-3 relative bg-white border rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-800">模型待訓練資料</h3>
            {/* 匯入 true label 移到 training modal，這裡移除 */}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 pr-4">Filename</th>
                  <th className="py-2 pr-4">Predicted label</th>
                  <th className="py-2 pr-4">Details</th>
                  <th className="py-2 pr-4">Finetuned</th>
                </tr>
              </thead>
              <tbody>
                {mainPageItems.map(row => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{row.filename}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: colors[row.pred] || "#999" }} />
                        {row.pred}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <button className="text-blue-600 hover:underline"
                        onClick={() => {
                          navigate("/report", {
                            state: { filename: row.filename, predLabel: row.pred },
                          });
                        }}>
                        View
                      </button>
                    </td>
                    <td className="py-2 pr-4">
                      <input type="checkbox" checked={!!row.finetuned} readOnly />
                    </td>
                  </tr>
                ))}
                {!trainRows.length && (
                  <tr><td colSpan={4} className="py-4 text-center text-slate-500">目前沒有資料列</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 分頁（主表） — 顯示固定總筆數 1000 */}
          <Pager
            page={mainPage}
            setPage={setMainPage}
            totalPages={Math.max(1, Math.ceil(1000 / PAGE_SIZE))}
            labelPrefix="現在是顯示"
            totalText="共1000筆資料"
          />

          <div className="mt-4">
            <button
              className={`px-4 py-2 rounded-lg text-white ${canTrainEnabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-400 cursor-not-allowed"}`}
              onClick={openTraining}
              disabled={!canTrainEnabled}
            >
              start training model
            </button>
          </div>
        </section>
      </main>

      {/* Bulk JSON Modal（for training modal） */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl shadow-xl w-[min(720px,92vw)] p-6">
            <div className="flex items-start justify-between">
              <h4 className="text-lg font-semibold">批次上傳真實標籤</h4>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setBulkOpen(false)}>✕</button>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              JSON 格式：<code className="bg-slate-100 px-1 py-0.5 rounded">[&#123;filename:"a.exe", true_label:"trojan"&#125;, ...]</code>
            </p>
            <div className="mt-4 space-y-3">
              <textarea rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)} className="w-full border rounded-lg p-3 font-mono text-sm" placeholder='[{"filename":"a.exe","true_label":"trojan"}]' />
              <div className="flex items-center gap-3">
                <input type="file" accept=".json,application/json" onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)} />
                <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={parseBulk}>確認</button>
              </div>
              {bulkError && <div className="text-red-600 text-sm">{bulkError}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Training Modal（重做：移除 checkbox 與 select all；加入 true-label draft 與匯入按鈕；全數標註才可訓練） */}
      {trainOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-[min(1000px,94vw)] p-6">
            <div className="flex items-start justify-between">
              <h4 className="text-lg font-semibold">Fill in the true label of the selected files</h4>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setTrainOpen(false)} disabled={training}>✕</button>
            </div>

            {!training ? (
              <>
                {/* 取代原本 select all 區塊，改為「匯入 true label」 */}
                <div className="flex items-center justify-end my-2 gap-2">
                  <button
                    className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-sm"
                    onClick={() => setBulkOpen(true)}
                  >
                    匯入true label（JSON / 貼上代碼）
                  </button>
                </div>

                <div className="max-h-[50vh] overflow-auto border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-left text-slate-600">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Filename</th>
                        <th className="py-2 px-3">Predicted</th>
                        <th className="py-2 px-3">True label</th>
                        <th className="py-2 px-3">True-label draft</th>
                        <th className="py-2 px-3">Submit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalPageItems.map((r, i) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="py-2 px-3">{(modalPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="py-2 px-3 font-mono">{r.filename}</td>
                          <td className="py-2 px-3">{r.pred}</td>
                          <td className="py-2 px-3">{r.trueLabel ?? "-"}</td>
                          <td className="py-2 px-3">
                            <select
                              className="border rounded px-2 py-1"
                              value={r.trueLabel && r.trueLabel !== "-" ? r.trueLabel : (r.provision ?? "")}
                              onChange={(e) => {
                                const v = e.target.value;
                                // 直接更新 modal pool 中的 trueLabel
                                setTrainPool(prev => prev.map(x => x.id === r.id ? { ...x, provision: v } : x));
                                setTrainRows(prev => prev.map(x => x.id === r.id ? { ...x, provision: v } : x));
                              }}
                            >
                              <option value="">-</option>
                              {labelChoices.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </td>
                          {/* Submit（按下後才把 trueLabel = provision） */}
                          <td className="py-2 px-3">
                            <button
                              className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                              disabled={!r.provision}
                              onClick={() => {
                                // ❸ 提交：把 trueLabel 寫入（Modal pool + 主資料表都同步）
                                setTrainPool(prev => prev.map(x => x.id === r.id ? { ...x, trueLabel: r.provision } : x));
                                setTrainRows(prev => prev.map(x => x.id === r.id ? { ...x, trueLabel: r.provision } : x));
                              }}
                            >
                              Submit
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!trainPool.length && (
                        <tr><td colSpan={4} className="py-4 text-center text-slate-500">沒有可用資料（需先上傳或從主表抽樣）</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 分頁（Modal 表） — 顯示固定總筆數 200 */}
                <Pager
                  page={modalPage}
                  setPage={setModalPage}
                  totalPages={Math.max(1, Math.ceil(200 / PAGE_SIZE))}
                  labelPrefix="現在是顯示"
                  totalText="共200筆資料"
                />

                <div className="flex items-center justify-between mt-4">
                  <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={() => setTrainOpen(false)}>cancel</button>
                  <button
                    className={`px-4 py-2 rounded-lg text-white ${allModalLabeled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-400 cursor-not-allowed"}`}
                    disabled={!allModalLabeled}
                    onClick={startTraining}
                  >
                    train the model
                  </button>
                </div>
              </>
            ) : (
              <div className="py-10 flex flex-col items-center gap-4">
                <CircleProgress key={trainCircleKey} durationSec={10} status="active" onDone={() => { }} size={128} />
                <div className="text-slate-700">Training in progress…</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
