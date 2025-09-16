// src/evaluation.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Plot from "react-plotly.js";

// ========= 你的 JSON URL（可依月份換 URL） =========
const EMBEDDING_URL =
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json";
const LABEL_LIST_URL =
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json";
// ================================================

// 固定顏色（常見類別先固定）
const FIXED_LABEL_COLORS = {
    "TROJAN.GENERIC": "#1f77b4",
    "ADWARE.SCREENSAVER": "#ff7f0e",
    GOODWARE: "#2ca02c",
    APT30: "#d62728",
    other: "#9467bd",
};

// 較長的離散色盤（不足再用 HSL）
const BASE_PALETTE = [
    "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
    "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
    "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];

function buildLabelColors(labels) {
    const result = {};
    // 1) 固定色
    labels.forEach((lab) => {
        if (FIXED_LABEL_COLORS[lab]) result[lab] = FIXED_LABEL_COLORS[lab];
    });
    // 2) 基礎色盤
    let idx = 0;
    labels.forEach((lab) => {
        if (!result[lab] && idx < BASE_PALETTE.length) {
            result[lab] = BASE_PALETTE[idx++];
        }
    });
    // 3) 不足用 HSL
    const rest = labels.filter((l) => !result[l]);
    rest.forEach((lab, i) => {
        const hue = Math.round((i * 360) / Math.max(1, rest.length));
        result[lab] = `hsl(${hue}, 70%, 50%)`;
    });
    return result;
}

function TopBar() {
    return (
        <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
            <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-800"><a href="/"> Platform name</a></div>
                <ul className="flex items-center gap-6 text-slate-700">
                    <li>
                        <a href="#about" className="hover:text-blue-500">
                            About us
                        </a>
                    </li>
                    <li>
                        <a href="./evaluation" className="hover:text-blue-500">
                            Evaluation
                        </a>
                    </li>
                    <li>
                        <a href="#tech" className="hover:text-blue-500">
                            Techniques
                        </a>
                    </li>
                </ul>
            </nav>
        </header>
    );
}

const Section = ({ title, children, right }) => (
    <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-800 font-semibold">{title}</h3>
            {right}
        </div>
        <div className="p-4">{children}</div>
    </section>
);

// 雙滑桿（不額外安裝套件）：兩個 range 疊在一起 + 中間填色
function RangeBar({ min, max, valueMin, valueMax, onChange }) {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const handleMin = (e) => {
        const v = Number(e.target.value);
        const newMin = Math.min(v, valueMax);
        onChange({ min: clamp(newMin, min, max), max: valueMax });
    };
    const handleMax = (e) => {
        const v = Number(e.target.value);
        const newMax = Math.max(v, valueMin);
        onChange({ min: valueMin, max: clamp(newMax, min, max) });
    };

    const pct = (v) => ((v - min) * 100) / (max - min);
    const left = pct(valueMin);
    const right = pct(valueMax);

    return (
        <div className="w-full relative h-8">
            {/* 背景軌道 */}
            <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded bg-slate-200" />
            {/* 選取區塊 */}
            <div
                className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-400 rounded"
                style={{ left: `${left}%`, width: `${right - left}%` }}
            />
            {/* 左滑桿 */}
            <input
                type="range"
                min={min}
                max={max}
                value={valueMin}
                onChange={handleMin}
                onInput={handleMin}
                aria-label="min-range"
                className="absolute w-full appearance-none bg-transparent"
                style={{ height: "8px", zIndex: 3 }}
            />

            <input
                type="range"
                min={min}
                max={max}
                value={valueMax}
                onChange={handleMax}
                onInput={handleMax}
                aria-label="max-range"
                className="absolute w-full appearance-none bg-transparent"
                style={{ height: "8px", zIndex: 3 }}
            />

            {/* 客製化拇指（各瀏覽器略有差異，先用原生） */}
        </div>
    );
}

export default function EvaluationPage() {
    useEffect(() => { document.title = "Periodic Evaluation"; }, []);

    // 讀數據
    const [labelList, setLabelList] = useState(null);
    const [allPoints, setAllPoints] = useState(null);
    const [loadErr, setLoadErr] = useState("");

    // time 的上下界
    const [timeMin, setTimeMin] = useState(1);
    const [timeMax, setTimeMax] = useState(1);
    const [selMin, setSelMin] = useState(1);
    const [selMax, setSelMax] = useState(1);

    // 載入 JSON
    useEffect(() => {
        (async () => {
            try {
                const [labRes, ptRes] = await Promise.all([
                    fetch(LABEL_LIST_URL),
                    fetch(EMBEDDING_URL),
                ]);
                if (!labRes.ok) throw new Error(`label_list HTTP ${labRes.status}`);
                if (!ptRes.ok) throw new Error(`embedding points HTTP ${ptRes.status}`);
                const [labs, pts] = await Promise.all([labRes.json(), ptRes.json()]);
                setLabelList(labs);

                // 需要 time 欄位（數字）；若缺少，預設為 1..N
                const hasTime = pts.length && typeof pts[0].time_period !== "undefined";
                const enriched = hasTime
                    ? pts
                    : pts.map((r, i) => ({ ...r, time_period: i + 1 }));

                setAllPoints(enriched);

                const tMin = Math.max(1, Math.min(...enriched.map((r) => Number(r.time_period) || 1)));
                const tMax = Math.max(...enriched.map((r) => Number(r.time_period) || 1));
                setTimeMin(tMin);
                setTimeMax(tMax);
                setSelMin(tMin);
                setSelMax(tMax);
            } catch (e) {
                setLoadErr(String(e));
            }
        })();
    }, []);

    // 顏色對應（固定 + 擴充 + HSL），保證不因為篩選而重新對應
    const labelColors = useMemo(() => {
        if (!labelList) return {};
        const uniq = Array.from(new Set(labelList)).filter(Boolean);
        return buildLabelColors(uniq);
    }, [labelList]);

    // 根據 time 選擇區間過濾
    const filteredPoints = useMemo(() => {
        if (!allPoints) return null;
        const lo = Math.max(timeMin, Math.min(selMin, selMax));
        const hi = Math.min(timeMax, Math.max(selMin, selMax));
        return allPoints.filter((r) => {
            const t = Number(r.time_period) || 0;
            return t >= lo && t <= hi;
        });
    }, [allPoints, timeMin, timeMax, selMin, selMax]);

    // 1) Embedding 降維圖（依 label 分組）
    const embeddingTraces = useMemo(() => {
        if (!filteredPoints) return [];
        const by = new Map();
        for (const r of filteredPoints) {
            const k = r.true_label || "other";
            if (!by.has(k)) by.set(k, []);
            by.get(k).push(r);
        }
        const order = labelList && Array.isArray(labelList) ? labelList : Array.from(by.keys());
        return order
            .filter((lab) => by.has(lab)) // 跳過沒有的 label，不重新對應
            .map((lab) => {
                const arr = by.get(lab);
                return {
                    type: "scattergl",
                    mode: "markers",
                    name: lab,
                    x: arr.map((d) => d.x),
                    y: arr.map((d) => d.y),
                    marker: { size: 4, color: labelColors[lab] || FIXED_LABEL_COLORS.other },
                    text: arr.map((d) => `true: ${d.true_label}${d.pred_label ? `<br>pred: ${d.pred_label}` : ""}`),
                    hoverinfo: "text",
                };
            });
    }, [filteredPoints, labelList, labelColors]);

    // 2) 類別比例統計（同樣用過濾後的資料）
    const classCounts = useMemo(() => {
        if (!filteredPoints) return null;
        const m = new Map();
        for (const r of filteredPoints) {
            const k = r.true_label || "other";
            m.set(k, (m.get(k) || 0) + 1);
        }
        const labels = Array.from(m.keys());
        const counts = labels.map((lab) => m.get(lab));
        const colors = labels.map((lab) => labelColors[lab] || FIXED_LABEL_COLORS.other);
        return { labels, counts, colors };
    }, [filteredPoints, labelColors]);

    // 3) 模型不確定樣本清單（在 time 範圍內，accuracy 由低到高）
    const uncertainRows = useMemo(() => {
        if (!filteredPoints) return null;
        const acc = (r) => (typeof r.accuracy === "number" ? r.accuracy : (typeof r.confidence === "number" ? r.confidence : 1));
        // 複製後排序
        const sorted = [...filteredPoints].sort((a, b) => acc(a) - acc(b));
        return sorted.slice(0, 50).map((r, i) => ({
            // 內部用 key 識別（不顯示 id）
            _key: r._key ?? `${r.filename ?? "f"}#${r.time_period ?? i}`,
            filename: r.filename ?? `sample_${i}.exe`,
            true_label: r.true_label ?? "other",
            pred_label: r.pred_label ?? "other",
            accuracy: acc(r),
            detail_url: r.detail_url ?? "/report",
        }));
    }, [filteredPoints]);

    // 4) 人工標註：編輯中的 new label
    const [edits, setEdits] = useState({});
    const setEdit = (key, lab) => setEdits((prev) => ({ ...prev, [key]: lab }));
    // ✅ 新增：切換 time 範圍就清空暫存標註
    useEffect(() => {
        setEdits({});
    }, [selMin, selMax]);

    // 提交（把選擇的標籤寫回 true_label，並刷新衍生圖表）
    const submitOne = useCallback((row) => {
        const newLab = edits[row._key];
        if (!newLab || newLab === row.true_label) return;

        // 在 allPoints 內找出該筆並更新 true_label
        setAllPoints((prev) => {
            if (!prev) return prev;
            const next = prev.map((p) => {
                const key = p._key ?? `${p.filename ?? "f"}#${p.time_period ?? ""}`;
                if (key === row._key) {
                    return { ...p, true_label: newLab };
                }
                return p;
            });
            return next;
        });

        // 清除此筆的 edit
        setEdits((prev) => {
            const cp = { ...prev };
            delete cp[row._key];
            return cp;
        });
    }, [edits]);

    // 顯示範圍比例（顯示在輸入框與滑桿中間）
    const rangeInfo = useMemo(() => {
        if (!allPoints || !filteredPoints) return null;
        const total = allPoints.length;
        const sel = filteredPoints.length;
        const pct = total ? Math.round((sel / total) * 100) : 0;
        return { sel, total, pct };
    }, [allPoints, filteredPoints]);

    // 輸入框變更
    const commitMin = (v) => {
        const n = Number(v);
        if (Number.isNaN(n)) return;
        const clamped = Math.max(timeMin, Math.min(n, selMax));
        setSelMin(clamped);
    };
    const commitMax = (v) => {
        const n = Number(v);
        if (Number.isNaN(n)) return;
        const clamped = Math.min(timeMax, Math.max(n, selMin));
        setSelMax(clamped);
    };

    return (
        <div className="min-h-screen">
            <TopBar />

            {/* 篩選器（Topbar 下方） */}
            <div className="sticky top-[56px] z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <div className="mx-auto max-w-6xl px-4 py-4">
                    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-4">
                        <div className="flex items-center gap-4">
                            {/* 左數字框：下限 */}
                            <div className="flex flex-col w-32">
                                <label className="text-xs text-slate-500 mb-1">下限 (time_period)</label>
                                <input
                                    type="number"
                                    min={timeMin}
                                    max={selMax}
                                    value={selMin}
                                    onChange={(e) => commitMin(e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>

                            {/* 中間：雙滑桿 + 比例 */}
                            <div className="flex-1">
                                <RangeBar
                                    min={timeMin}
                                    max={timeMax}
                                    valueMin={selMin}
                                    valueMax={selMax}
                                    onChange={({ min, max }) => {
                                        setSelMin(min);
                                        setSelMax(max);
                                    }}
                                />
                                <div className="mt-1 text-xs text-slate-600">
                                    {rangeInfo
                                        ? `選取 ${selMin} ~ ${selMax}（${rangeInfo.sel}/${rangeInfo.total}, 約 ${rangeInfo.pct}%）`
                                        : "讀取中…"}
                                </div>
                            </div>

                            {/* 右數字框：上限 */}
                            <div className="flex flex-col w-32">
                                <label className="text-xs text-slate-500 mb-1">上限 (time_period)</label>
                                <input
                                    type="number"
                                    min={selMin}
                                    max={timeMax}
                                    value={selMax}
                                    onChange={(e) => commitMax(e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="mx-auto max-w-6xl px-4 py-6">
                {/* 1) Embedding 降維圖 */}
                <Section
                    title="Embedding 降維圖（本月新增 & 完成分析）"
                    right={<span className="text-sm text-slate-500">來源：<code>tsne_points.json</code></span>}
                >
                    {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
                    {!filteredPoints ? (
                        <div>Loading…</div>
                    ) : (
                        <Plot
                            data={embeddingTraces}
                            layout={{
                                margin: { t: 24, r: 16, b: 40, l: 40 },
                                legend: { orientation: "h" },
                            }}
                            style={{ width: "100%", height: 420 }}
                            config={{ responsive: true, displayModeBar: true }}
                        />
                    )}
                </Section>

                {/* 2) 類別比例統計 */}
                <Section
                    title="類別比例統計（這個月）"
                    right={<span className="text-sm text-slate-500">來源：<code>tsne_points.json</code></span>}
                >
                    {!classCounts ? (
                        <div>Loading…</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 長條圖 */}
                            <Plot
                                data={[{
                                    type: "bar",
                                    x: classCounts.labels,
                                    y: classCounts.counts,
                                    marker: { color: classCounts.colors },
                                }]}
                                layout={{ margin: { t: 24, r: 16, b: 80, l: 40 } }}
                                style={{ width: "100%", height: 320 }}
                                config={{ responsive: true }}
                            />
                            {/* 圓餅圖 */}
                            <Plot
                                data={[{
                                    type: "pie",
                                    labels: classCounts.labels,
                                    values: classCounts.counts,
                                    marker: { colors: classCounts.colors },
                                    hole: 0.3,
                                }]}
                                layout={{ margin: { t: 24, r: 16, b: 24, l: 16 } }}
                                style={{ width: "100%", height: 320 }}
                                config={{ responsive: true }}
                            />
                        </div>
                    )}
                </Section>

                {/* 3) 模型不確定樣本清單（time 範圍內、accuracy 由低到高） */}
                <Section title="模型不確定樣本清單（Top 50，依 accuracy 由低到高）">
                    {!uncertainRows ? (
                        <div>Loading…</div>
                    ) : uncertainRows.length === 0 ? (
                        <div className="text-slate-500 text-sm">選取範圍內沒有樣本。</div>
                    ) : (
                        <div className="overflow-auto rounded-xl border border-slate-200">
                            <table key={`${selMin}-${selMax}`} className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                        {/* 去掉 id */}
                                        <th className="px-3 py-2 text-left">Filename</th>
                                        <th className="px-3 py-2 text-left">True label</th>
                                        <th className="px-3 py-2 text-left">Pred label</th>
                                        <th className="px-3 py-2 text-left">Accuracy</th>
                                        <th className="px-3 py-2 text-left">Detail</th>
                                        <th className="px-3 py-2 text-left">Annotate</th>
                                        <th className="px-3 py-2 text-left">Submit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {uncertainRows.map((r) => (
                                        <tr key={r._key} className="border-t">
                                            <td className="px-3 py-2 font-mono">{r.filename}</td>

                                            {/* True label（顏色固定，不會因為 subset 位移） */}
                                            <td className="px-3 py-2">
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded text-white"
                                                    style={{ background: (labelColors[r.true_label] || FIXED_LABEL_COLORS.other) }}
                                                >
                                                    {r.true_label}
                                                </span>
                                            </td>

                                            <td className="px-3 py-2">
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded text-white"
                                                    style={{ background: (labelColors[r.pred_label] || FIXED_LABEL_COLORS.other) }}
                                                >
                                                    {r.pred_label}
                                                </span>
                                            </td>


                                            <td className="px-3 py-2">{typeof r.accuracy === "number" ? r.accuracy.toFixed(3) : "-"}</td>

                                            <td className="px-3 py-2">
                                                <a className="text-blue-600 hover:underline" href={r.detail_url} target="_blank" rel="noreferrer">
                                                    Report
                                                </a>
                                            </td>

                                            <td className="px-3 py-2">
                                                <select
                                                    value={edits[r._key] ?? ""}
                                                    onChange={(e) => setEdit(r._key, e.target.value)}
                                                    className="border rounded px-2 py-1"
                                                >
                                                    <option value="">— 選擇標籤 —</option>
                                                    {(labelList || Object.keys(FIXED_LABEL_COLORS)).map((lab) => (
                                                        <option key={lab} value={lab}>{lab}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() => submitOne(r)}
                                                    disabled={!edits[r._key] || edits[r._key] === r.true_label}
                                                    className={`px-3 py-1 rounded ${(!edits[r._key] || edits[r._key] === r.true_label)
                                                        ? "bg-slate-200 text-slate-500"
                                                        : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                                                >
                                                    Submit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>
            </main>
        </div>
    );
}
