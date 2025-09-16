import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

/** ==========================
 *  JSON sources (GitHub raw)
 *  ========================== */
export const LABELS_JSON = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json"; // e.g. https://raw.githubusercontent.com/<user>/<repo>/main/labels.json
export const ANY_DATA_JSON_WITH_TRUE_LABELS = ""; // optional: derive labels from dataset "true_label"

/** ==========================
 *  Palette (provided)
 *  ========================== */
export const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];

function assignColors(labels) {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800">
          <Link to="/">PUZ Malware Lab</Link>
        </div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li><a href="#about" className="hover:text-blue-600">About</a></li>
          <li><Link className="hover:text-blue-600" to="/evaluation">Evaluation</Link></li>
          <li><Link className="hover:text-blue-600" to="/report">Report</Link></li>
        </ul>
      </nav>
    </header>
  );
}

/** -------- Animated Bullets --------
 * 僅在「每個檔案開始處理前」播放一次；progress circle 執行期間完全不動
 */
function AnimatedBullets({ items, playKey, title }) {
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    setVisibleCount(0);
    if (!items?.length || !playKey) return;
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
      <p className="mt-3 text-xs text-slate-500">
        每 3 秒顯示下一點；僅在「檔案處理開始前」播放一次，進度圈期間不會動。
      </p>
    </div>
  );
}

/** -------- Progress Circle -------- */
function CircleProgress({ durationSec, active, onDone, size=64 }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    if (!active) { setOffset(circumference); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (durationSec * 1000));
      setOffset(circumference * (1 - t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationSec, circumference, onDone]);

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="mx-auto">
      <circle cx="40" cy="40" r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none"/>
      <circle
        cx="40" cy="40" r={radius}
        stroke="#3b82f6" strokeWidth="8" fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
    </svg>
  );
}

export default function Home() {
  /** ===== Load labels from JSON ===== */
  const [labelChoices, setLabelChoices] = useState([]);
  const labelColorMap = useMemo(() => assignColors(labelChoices), [labelChoices]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
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
      } catch {/* leave empty */}
    }
    loadLabels();
    return () => { cancelled = true; };
  }, []);

  /** ===== Queues: active batch vs next batch =====
   * 修正 #4：分成 activeQueue（目前批次）與 pendingQueue（下一批）
   */
  const [activeQueue, setActiveQueue] = useState([]);   // Array<File> for current batch
  const [pendingQueue, setPendingQueue] = useState([]); // Array<File> for next batch
  const [processing, setProcessing] = useState(false);  // 是否正在處理（activeQueue 有目前檔案）
  const [currentBatchTotal, setCurrentBatchTotal] = useState(0); // 這一批的總數
  const [lastBatchTotal, setLastBatchTotal] = useState(0);       // 已完成批的總數（為了顯示 0/N）

  /** ===== Bullets & circles control =====
   * 修正 #1：bullets 只在「每個檔案開始處理前」播放一次；progress 期間不動
   */
  const bulletItems = ["PE 32-file", "is .exe", "is UPX compressed"];
  const [bulletPlayKey, setBulletPlayKey] = useState(0); // 僅在「開始新檔案」時遞增
  const [bulletsDone, setBulletsDone] = useState(false);
  const [circleStep, setCircleStep] = useState(0); // 0..2

  /** ===== Training table ===== */
  const [trainRows, setTrainRows] = useState([]);
  const nextIdRef = useRef(1);

  const randomPred = () => labelChoices.length
    ? labelChoices[Math.floor(Math.random() * labelChoices.length)]
    : "clean";

  const validateAllExe = (files) => {
    if (!files.length) return false;
    for (const f of files) {
      const name = (f.name || "").toLowerCase().trim();
      if (!name.endsWith(".exe")) return false;
    }
    return true;
  };

  /** ===== Handle uploads =====
   * - 若目前「沒有在處理」→ 把這批設為 activeQueue（新批次），更新 batchTotal，並啟動處理
   * - 若目前正在處理 → 放進 pendingQueue（下一批）
   */
  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!validateAllExe(files)) {
      window.alert("上傳檔案須為執行檔，請確認檔案內容皆正確");
      return;
    }
    if (!processing && activeQueue.length === 0) {
      // 開啟新批次
      setActiveQueue(files);
      setCurrentBatchTotal(files.length);
      setLastBatchTotal(files.length); // 顯示用
      // 「匯入完成後才啟動」→ 這裡啟動第一個檔案的 bullets，然後進入處理狀態
      startNextFile(files[0]);
    } else {
      // 正在處理：下一批
      setPendingQueue(prev => prev.concat(files));
      // 不改動目前批次的計數顯示
    }
  };

  const onInputChange = (e) => handleFiles(e.target.files);
  const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  /** ===== Start next file in activeQueue ===== */
  const startNextFile = (file) => {
    if (!file) return;
    setProcessing(true);
    setBulletsDone(false);
    setCircleStep(0);
    // 只在這裡遞增 playKey（每個檔案處理前一次）
    setBulletPlayKey(k => k + 1);

    // bullets 時長：3 項 * 3s + buffer
    const totalMs = bulletItems.length * 3000 + 200;
    setTimeout(() => setBulletsDone(true), totalMs);
  };

  /** ===== 當 bullets 完成後，才開始 3 個進度圈 ===== */
  useEffect(() => {
    if (!processing || !bulletsDone) return;
    setCircleStep(0);
  }, [processing, bulletsDone]);

  /** ===== 當某一檔案全部處理完成（3 個 circle 跑完） ===== */
  const afterFileFullyProcessed = (file) => {
    // 加到模型待訓練資料（新的一列）
    const id = nextIdRef.current++;
    const row = {
      id,
      filename: file.name,
      pred: randomPred(),
      trueLabel: "-",
      provision: "",
    };
    setTrainRows(prev => [row, ...prev]); // 新的在最上
  };

  /** ===== 進度圈完成 callback ===== */
  const onCircleDone = () => {
    if (circleStep < 2) {
      setCircleStep(s => s + 1);
    } else {
      // 這個檔案處理完畢
      const current = activeQueue[0];
      afterFileFullyProcessed(current);

      // 從 activeQueue 移除當前檔案
      setActiveQueue(prev => {
        const rest = prev.slice(1);
        if (rest.length > 0) {
          // 還有下一個檔案 → 開始下一個
          setProcessing(false); // 防止 bullets 在圈圈間誤觸
          // 下一個事件循環再觸發，避免 state 競態
          setTimeout(() => startNextFile(rest[0]), 0);
        } else {
          // 這一批處理完 → 檢查是否有 pending 批次
          setProcessing(false);
          if (pendingQueue.length > 0) {
            // 轉移 pending 為新的 active 批
            const nextBatch = pendingQueue.slice();
            setPendingQueue([]);
            setActiveQueue(nextBatch);
            setCurrentBatchTotal(nextBatch.length);
            setLastBatchTotal(nextBatch.length); // 顯示用
            setTimeout(() => startNextFile(nextBatch[0]), 0);
          } else {
            // 完全 idle；保留 lastBatchTotal 以顯示 0/N
            setCurrentBatchTotal(0);
          }
        }
        return rest;
      });
    }
  };

  /** ===== Bulk JSON for true labels（保留） ===== */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkError, setBulkError] = useState("");

  const applyBulkJson = (entries) => {
    setTrainRows(prev => prev.map(row => {
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
      if (bulkFile) text = await bulkFile.text();
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
      applyBulkJson(entries);
      setBulkOpen(false); setBulkText(""); setBulkFile(null);
    } catch {
      setBulkError("JSON 解析失敗，請確認格式為：[{\"filename\":\"xxx.exe\",\"true_label\":\"trojan\"}, ...]");
    }
  };

  /** ===== Training modal（保留） ===== */
  const [trainOpen, setTrainOpen] = useState(false);
  const eligible = useMemo(() => trainRows.filter(r => r.trueLabel && r.trueLabel !== "-"), [trainRows]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainCircleKey, setTrainCircleKey] = useState(0);

  const toggleSelectAll = () => {
    if (selectAll) { setSelectedIds(new Set()); setSelectAll(false); }
    else { setSelectedIds(new Set(eligible.map(r => r.id))); setSelectAll(true); }
  };
  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const startTraining = () => {
    if (!selectedIds.size) { setTrainOpen(false); return; }
    setTraining(true);
    setTrainCircleKey(k => k + 1);
    setTimeout(() => {
      setTraining(false);
      setTrainOpen(false);
      setTrainRows([]);
      setActiveQueue([]);
      setPendingQueue([]);
      setProcessing(false);
      setCurrentBatchTotal(0);
      setLastBatchTotal(0);
      setSelectedIds(new Set());
      setSelectAll(false);
    }, 60000);
  };

  /** ===== Counter 顯示（修正 #4） =====
   * - 進行中：remaining = activeQueue.length（包含目前檔案），total = currentBatchTotal
   * - Idle：remaining = 0，total = lastBatchTotal（如 0/2）
   */
  const remaining = activeQueue.length > 0 ? activeQueue.length : 0;
  const total = activeQueue.length > 0 ? currentBatchTotal : lastBatchTotal;

  /** ===== Responsive 版面（修正 #3） =====
   * xl: 兩欄 → 左（上傳 + bullets），右（progress + table）
   * md 以下：單欄 → 上傳 → bullets → progress → table
   */
  const currentFile = activeQueue[0];
  const bulletsTitle = currentFile ? `${currentFile.name} has…` : "等待處理的檔案…";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopBar />

      <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* 左欄：上傳 + bullets（在 md/below 也會在上傳正下方） */}
        <div className="space-y-6">
          <section
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white shadow-sm"
            onDrop={(e) => { e.preventDefault(); onDrop(e); }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Upload .exe (single/multiple or whole folder)</h2>
              <div className="text-xs text-slate-500">支援多檔與整個資料夾上傳（僅限 .exe）</div>
            </div>
            <div className="flex items-center gap-3">
              <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" id="folderInput" onChange={onInputChange} />
              <label htmlFor="folderInput" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                Select files / folder
              </label>

              <input type="file" accept=".exe" multiple id="filesInput" className="hidden" onChange={onInputChange} />
              <label htmlFor="filesInput" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">
                Select executables
              </label>

              <span className="text-sm text-slate-500">或直接把資料夾/檔案拖曳到此區</span>
            </div>

            {/* Counter（以批次顯示） */}
            <div className="mt-4 text-sm text-slate-600">
              {total ? `待處理檔案數：${remaining} / ${total}` : "尚未選擇檔案"}
            </div>
          </section>

          {/* Bullets：永遠放在上傳區正下方（xl 左欄；md 以下同一欄） */}
          <AnimatedBullets
            items={bulletItems}
            playKey={processing && !bulletsDone ? bulletPlayKey : 0 /* 只有在「檔案開始處理且 bullets 尚未完成」才播放 */}
            title={bulletsTitle}
          />
        </div>

        {/* 右欄：progress + table（md 以下會排在 bullets 後面） */}
        <section className="space-y-6">
          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Processing (per file)</h3>
            <div className="grid grid-cols-3 gap-6">
              {["Static checks", "Scan engine", "Report prep"].map((label, i) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <CircleProgress
                    durationSec={6}
                    active={processing && bulletsDone && circleStep === i}
                    onDone={onCircleDone}
                  />
                  <div className="text-slate-700 text-sm">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">{processing ? currentFile?.name : ""}</div>
          </div>

          {/* 模型待訓練資料（保留 Details 欄） */}
          <div className="relative bg-white border rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-800">模型待訓練資料</h3>
              <button
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
                onClick={() => setBulkOpen(true)}
              >
                匯入真實標籤（JSON / 貼上代碼）
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 border-b">
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Predicted label</th>
                    <th className="py-2 pr-4">True label</th>
                    <th className="py-2 pr-4">True-label draft</th>
                    <th className="py-2 pr-4">Details</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trainRows.map(row => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-mono">{row.filename}</td>
                      <td className="py-2 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{background: (labelColorMap[row.pred] || "#999")}}/>
                          {row.pred}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{row.trueLabel}</td>
                      <td className="py-2 pr-4">
                        <select
                          className="border rounded px-2 py-1"
                          value={row.provision ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTrainRows(prev => prev.map(r => r.id === row.id ? { ...r, provision: v } : r));
                          }}
                        >
                          <option value="">-</option>
                          {labelChoices.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <a
                          className="text-blue-600 hover:underline"
                          href={`/report-1?file=${encodeURIComponent(row.filename)}`}
                          target="_blank" rel="noreferrer"
                        >
                          View
                        </a>
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={!row.provision}
                          onClick={() => {
                            setTrainRows(prev => prev.map(r => r.id === row.id ? { ...r, trueLabel: r.provision } : r));
                          }}
                        >
                          Submit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!trainRows.length && (
                    <tr><td colSpan={6} className="py-4 text-center text-slate-500">目前沒有資料列</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setTrainOpen(true)}
              >
                start training model
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Bulk JSON Modal */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
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

      {/* Training Modal（省略：和你現有版一樣） */}
      {trainOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-[min(900px,94vw)] p-6">
            <div className="flex items-start justify-between">
              <h4 className="text-lg font-semibold">Select the files you would like to feed into the model</h4>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setTrainOpen(false)} disabled={training}>✕</button>
            </div>

            {!training ? (
              <>
                {/* ...（與你原本相同，略） */}
                <div className="flex items-center justify-between mt-4">
                  <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={() => setTrainOpen(false)}>cancel</button>
                  <button
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={!eligible.length}
                    onClick={startTraining}
                  >
                    train the model
                  </button>
                </div>
              </>
            ) : (
              <div className="py-10 flex flex-col items-center gap-4">
                <CircleProgress durationSec={60} active onDone={() => {}} size={128} />
                <div className="text-slate-700">Training in progress… (~60s)</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
