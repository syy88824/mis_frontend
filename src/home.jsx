import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

// ---- Shared label set & colors (keep in sync with ReportPage & Evaluation) ----
export const LABELS = ["adware", "trojan", "worm", "downloader", "ransomware", "spyware", "clean"];
export const LABEL_COLORS = {
  adware: "#1f77b4",
  trojan: "#ff7f0e",
  worm: "#2ca02c",
  downloader: "#d62728",
  ransomware: "#9467bd",
  spyware: "#8c564b",
  clean: "#17becf",
};

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

// ---- Animated bullet list at top-right ----
function AnimatedBullets({ items, keySeed }) {
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    setVisibleCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleCount(v => Math.min(items.length, v + 1));
      if (i >= items.length) clearInterval(id);
    }, 3000); // appear one every 3 seconds
    return () => clearInterval(id);
  }, [items, keySeed]);
  return (
    <ul className="list-disc pl-6 text-sm text-slate-700">
      {items.slice(0, visibleCount).map((t, idx) => (
        <li key={idx} className="mb-1">{t}</li>
      ))}
    </ul>
  );
}

// ---- Progress Circle ----
function CircleProgress({ durationSec, active, onDone, size=64 }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    if (!active) return;
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

// ---- Home Page ----
export default function Home() {
  // Upload & queue
  const [queue, setQueue] = useState([]); // [{name, file}]
  const [processingIdx, setProcessingIdx] = useState(-1);
  const [bulletKey, setBulletKey] = useState(0);

  // "模型待訓練資料" rows
  const [trainRows, setTrainRows] = useState([]); // [{id, filename, pred, trueLabel, provision}]
  const nextIdRef = useRef(1);

  // Modal: bulk JSON label import
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkError, setBulkError] = useState("");

  // Modal: start training
  const [trainOpen, setTrainOpen] = useState(false);
  const eligible = useMemo(() => trainRows.filter(r => r.trueLabel && r.trueLabel !== "-"), [trainRows]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainCircleKey, setTrainCircleKey] = useState(0);

  // Right-top animated bullets source, re-run per file
  const bulletItems = ["PE 32-file", "is .exe", "is UPX compressed"];

  // ---- Helpers ----
  const randomPred = () => LABELS[Math.floor(Math.random() * LABELS.length)];
  const addRowsFromFiles = (files) => {
    const newRows = [];
    for (const f of files) {
      const id = nextIdRef.current++;
      newRows.push({ id, filename: f.name, pred: randomPred(), trueLabel: "-", provision: "" });
    }
    // Newest first (later uploads on top)
    setTrainRows(prev => [...newRows.reverse(), ...prev]);
  };

  const validateExeList = (files) => {
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".exe")) return false;
    }
    return true;
  };

  // ---- Upload handlers ----
  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    if (!validateExeList(files)) {
      window.alert("上傳檔案須為執行檔，請確認檔案內容皆正確");
      return;
    }
    // Queue them
    setQueue(prev => [...prev, ...files]);
    // Add to training-table immediately
    addRowsFromFiles(files);
    // Kick off processing if idle
    setProcessingIdx(pi => (pi === -1 ? 0 : pi));
    setBulletKey(k => k + 1);
  };

  const onInputChange = (e) => handleFiles(e.target.files);
  const onDrop = (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    // Support directories (webkitdirectory will flatten into files)
    const files = dt.files;
    handleFiles(files);
  };

  // ---- Processing state machine: for each file run bullets + 3 progress circles ----
  const [circleStep, setCircleStep] = useState(0); // 0..2 per file
  const [bulletDone, setBulletDone] = useState(false);
  useEffect(() => {
    if (processingIdx < 0 || processingIdx >= queue.length) return;
    // Reset bullets animation for each file
    setBulletDone(false);
    setCircleStep(0);
    setBulletKey(k => k + 1);

    // Mark bullets done after (items.length-1)*3s + small buffer
    const totalMs = (bulletItems.length) * 3000 + 200;
    const t = setTimeout(() => setBulletDone(true), totalMs);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingIdx]);

  // Advance circles after bullets complete
  useEffect(() => {
    if (!bulletDone || processingIdx < 0 || processingIdx >= queue.length) return;
    setCircleStep(0);
  }, [bulletDone, processingIdx]);

  const onCircleDone = () => {
    if (circleStep < 2) {
      setCircleStep(s => s + 1);
    } else {
      // This file done; move to next
      setProcessingIdx(i => {
        const next = i + 1;
        if (next >= queue.length) return -1; // stop on Home (no navigation)
        setBulletKey(k => k + 1);
        return next;
      });
    }
  };

  // ---- Bulk JSON modal actions ----
  const applyBulkJson = (entries) => {
    // entries: array of {filename, true_label}
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
      if (bulkFile) {
        text = await bulkFile.text();
      }
      if (!text) return;
      // Accept either {filename:"a", true_label:"x"} or an array of such
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
      setBulkOpen(false);
      setBulkText("");
      setBulkFile(null);
    } catch (err) {
      setBulkError("JSON 解析失敗，請確認格式為：[{\"filename\":\"xxx.exe\",\"true_label\":\"trojan\"}, ...]");
    }
  };

  // ---- Training modal ----
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(eligible.map(r => r.id)));
      setSelectAll(true);
    }
  };

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startTraining = () => {
    if (!selectedIds.size) {
      setTrainOpen(false);
      return;
    }
    setTraining(true);
    setTrainCircleKey(k => k + 1);
    // Faux 60s training; after done, clear table & close
    setTimeout(() => {
      setTraining(false);
      setTrainOpen(false);
      setTrainRows([]);
      setQueue([]);
      setProcessingIdx(-1);
      setSelectedIds(new Set());
      setSelectAll(false);
    }, 60000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopBar />

      <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Uploader & circles */}
        <section className="lg:col-span-2 space-y-6">
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white shadow-sm"
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Upload .exe (single/multiple or whole folder)</h2>
              <div className="text-xs text-slate-500">支援多檔與整個資料夾上傳（僅限 .exe）</div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                multiple
                // directory uploads (Chromium-based)
                webkitdirectory="true"
                directory="true"
                className="hidden"
                id="folderInput"
                onChange={onInputChange}
              />
              <label htmlFor="folderInput" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                Select files / folder
              </label>

              <input type="file" accept=".exe" multiple id="filesInput" className="hidden" onChange={onInputChange} />
              <label htmlFor="filesInput" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">
                Select executables
              </label>

              <span className="text-sm text-slate-500">或直接把資料夾/檔案拖曳到此區</span>
            </div>

            {/* Queue status */}
            <div className="mt-4 text-sm text-slate-600">
              {queue.length ? `待處理檔案數：${queue.length - (processingIdx >= 0 ? processingIdx : queue.length)} / ${queue.length}` : "尚未選擇檔案"}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Processing (per file)</h3>
            <div className="grid grid-cols-3 gap-6">
              {["Static checks", "Scan engine", "Report prep"].map((label, i) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <CircleProgress
                    durationSec={6}
                    active={processingIdx >= 0 && bulletDone && circleStep === i}
                    onDone={onCircleDone}
                  />
                  <div className="text-slate-700 text-sm">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">{processingIdx >= 0 && queue[processingIdx]?.name}</div>
          </div>

          {/* 模型待訓練資料 */}
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
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trainRows.map(row => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-mono">{row.filename}</td>
                      <td className="py-2 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{background: LABEL_COLORS[row.pred]}}/>
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
                          {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
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
                    <tr><td colSpan={5} className="py-4 text-center text-slate-500">目前沒有資料列</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Start training button */}
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

        {/* Right: animated bullets */}
        <aside className="lg:col-span-1">
          <div className="bg-white border rounded-xl p-6 shadow-sm sticky top-24">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">This file has…</h3>
            <AnimatedBullets items={bulletItems} keySeed={bulletKey} />
            <p className="mt-3 text-xs text-slate-500">每 3 秒顯示下一點；每個檔案處理時會重新播放。</p>
          </div>
        </aside>
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
              JSON 上傳格式：<code className="bg-slate-100 px-1 py-0.5 rounded">[&#123;filename:"a.exe", true_label:"trojan"&#125;, ...]</code>
            </p>
            <div className="mt-4 space-y-3">
              <textarea
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="w-full border rounded-lg p-3 font-mono text-sm"
                placeholder='[{"filename":"a.exe","true_label":"trojan"}]'
              />
              <div className="flex items-center gap-3">
                <input type="file" accept=".json,application/json" onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)} />
                <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={parseBulk}>確認</button>
              </div>
              {bulkError && <div className="text-red-600 text-sm">{bulkError}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Training Modal */}
      {trainOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-[min(900px,94vw)] p-6">
            <div className="flex items-start justify-between">
              <h4 className="text-lg font-semibold">Select the files you would like to feed into the model</h4>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setTrainOpen(false)} disabled={training}>✕</button>
            </div>

            {!training ? (
              <>
                <div className="flex items-center justify-end my-2">
                  <button
                    className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-sm"
                    onClick={toggleSelectAll}
                  >
                    {selectAll ? "deselect all" : "select all"}
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
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map(r => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="py-2 px-3">
                            <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                          </td>
                          <td className="py-2 px-3 font-mono">{r.filename}</td>
                          <td className="py-2 px-3">{r.pred}</td>
                          <td className="py-2 px-3">{r.trueLabel}</td>
                        </tr>
                      ))}
                      {!eligible.length && (
                        <tr><td colSpan={4} className="py-4 text-center text-slate-500">沒有可用資料（需先填入 True label）</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

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
                <CircleProgress key={trainCircleKey} durationSec={60} active onDone={() => {}} size={128} />
                <div className="text-slate-700">Training in progress… (~60s)</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
