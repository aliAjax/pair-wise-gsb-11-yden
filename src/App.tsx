import { FormEvent, useEffect, useMemo, useState } from "react";

type Field = {
  key: string;
  label: string;
  type?: "number" | "date" | "select";
  options?: string[];
};

type Rectification = {
  responsible: string; // 整改责任人
  deadline: string; // 整改期限
  safetyMeasures: string; // 临时安全措施
  progress: string; // 待整改 / 整改中 / 已闭环
  resolution: string; // 处理说明（闭环必填）
  closedAt?: string;
};

type RecordItem = {
  id: string;
  status: string;
  notes: string;
  createdAt: string;
  rectification?: Rectification;
  [key: string]: string | number | Rectification | undefined;
};

const project = {
  "number": 10,
  "folder": "dfwl/frontend/dfwlfront-10",
  "framework": "react",
  "title": "油站设备巡检清单",
  "subtitle": "创建巡检项、登记异常并跟踪整改闭环，逾期未闭环一目了然。",
  "industry": "石油",
  "stack": [
    "React",
    "Vite",
    "TypeScript",
    "Zustand",
    "Ant Design"
  ],
  "storageKey": "dfwlfront-10-inspection",
  "formTitle": "新增巡检项",
  "primaryAction": "加入清单",
  "entityLabel": "巡检项",
  "statuses": [
    "未检",
    "正常",
    "异常"
  ],
  "progressFlow": [
    "待整改",
    "整改中",
    "已闭环"
  ],
  "filters": [
    "全部区域",
    "加油区",
    "油罐区",
    "收银区"
  ],
  "fields": [
    {
      "key": "item",
      "label": "巡检项"
    },
    {
      "key": "area",
      "label": "区域",
      "type": "select",
      "options": [
        "加油区",
        "油罐区",
        "收银区"
      ]
    },
    {
      "key": "inspector",
      "label": "巡检人"
    },
    {
      "key": "checkedAt",
      "label": "巡检日期",
      "type": "date"
    }
  ],
  "records": [
    {
      "item": "加油机1号",
      "area": "加油区",
      "inspector": "何鑫",
      "checkedAt": "2026-06-30",
      "status": "正常",
      "notes": "无异常"
    },
    {
      "item": "卸油口密封",
      "area": "油罐区",
      "inspector": "何鑫",
      "checkedAt": "2026-06-30",
      "status": "异常",
      "notes": "密封圈老化",
      "rectification": {
        "responsible": "李工",
        "deadline": "2026-07-05",
        "safetyMeasures": "暂停卸油作业，现场设置警戒线并配备灭火器材",
        "progress": "整改中",
        "resolution": ""
      }
    }
  ],
  "metricLabels": [
    "巡检项",
    "异常",
    "已检",
    "逾期未闭环"
  ]
} as const;

const fields = project.fields as unknown as Field[];
const statuses: string[] = [...project.statuses];
const progressFlow: string[] = [...project.progressFlow];

const statusClass: Record<string, string> = {
  未检: "status-pending",
  正常: "status-ok",
  异常: "status-bad"
};

function createBlank() {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === "number" ? 0 : ""]));
}

function blankRectification() {
  return { responsible: "", deadline: "", safetyMeasures: "" };
}

function todayStr() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// 历史数据中的异常记录补齐整改信息，保证刷新后结构一致
function ensureRectification(record: RecordItem): RecordItem {
  if (record.status === "异常" && !record.rectification) {
    return {
      ...record,
      rectification: {
        responsible: "待登记",
        deadline: String(record.checkedAt || todayStr()),
        safetyMeasures: "待登记",
        progress: progressFlow[0],
        resolution: ""
      }
    };
  }
  return record;
}

function loadRecords(): RecordItem[] {
  const raw = localStorage.getItem(project.storageKey);
  if (!raw) {
    const seeds = project.records.map((record, index) => ({
      ...record,
      id: `seed-${index + 1}`,
      createdAt: new Date(Date.now() - index * 86400000).toISOString()
    })) as unknown as RecordItem[];
    return seeds.map(ensureRectification);
  }
  try {
    return (JSON.parse(raw) as RecordItem[]).map(ensureRectification);
  } catch {
    return [];
  }
}

function saveRecords(records: RecordItem[]) {
  localStorage.setItem(project.storageKey, JSON.stringify(records));
}

function isOpenAnomaly(record: RecordItem) {
  return record.status === "异常" && !!record.rectification && record.rectification.progress !== progressFlow[2];
}

function isOverdue(record: RecordItem) {
  const rect = record.rectification;
  return isOpenAnomaly(record) && !!rect && !!rect.deadline && rect.deadline < todayStr();
}

function openAnomaliesInArea(records: RecordItem[], area: string) {
  return records.filter((record) => record.area === area && isOpenAnomaly(record));
}

function earliestDiscovery(anomalies: RecordItem[]) {
  return anomalies.map((record) => String(record.checkedAt)).sort()[0] || "";
}

function primaryText(record: RecordItem) {
  const first = fields[0];
  const second = fields[1];
  return [record[first.key], record[second.key]].filter(Boolean).join(" / ") || project.entityLabel;
}

function RecordCard({
  record,
  areaLocked,
  onChange,
  onRemove
}: {
  record: RecordItem;
  areaLocked: boolean;
  onChange: (next: RecordItem) => void;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<"" | "anomaly" | "close">("");
  const [draft, setDraft] = useState(blankRectification);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");

  const rect = record.rectification;
  const openAnomaly = isOpenAnomaly(record);
  const overdue = isOverdue(record);
  const progressIndex = rect ? progressFlow.indexOf(rect.progress) : -1;

  function resetInline() {
    setMode("");
    setError("");
    setResolution("");
    setDraft(blankRectification());
  }

  function markNormal() {
    if (areaLocked) {
      setError("该区域存在未闭环异常，不得标记为正常");
      return;
    }
    onChange({ ...record, status: "正常" });
  }

  function submitAnomaly() {
    if (!draft.responsible.trim() || !draft.deadline || !draft.safetyMeasures.trim()) {
      setError("登记异常必须填写整改责任人、整改期限和临时安全措施");
      return;
    }
    onChange({
      ...record,
      status: "异常",
      rectification: {
        responsible: draft.responsible.trim(),
        deadline: draft.deadline,
        safetyMeasures: draft.safetyMeasures.trim(),
        progress: progressFlow[0],
        resolution: ""
      }
    });
    resetInline();
  }

  function advanceProgress() {
    if (!rect) return;
    if (rect.progress === progressFlow[0]) {
      onChange({ ...record, rectification: { ...rect, progress: progressFlow[1] } });
    } else if (rect.progress === progressFlow[1]) {
      setMode("close");
    }
  }

  function submitClose() {
    if (!rect) return;
    if (!resolution.trim()) {
      setError("闭环必须填写处理说明");
      return;
    }
    onChange({
      ...record,
      rectification: { ...rect, progress: progressFlow[2], resolution: resolution.trim(), closedAt: todayStr() }
    });
    resetInline();
  }

  return (
    <article className="record">
      <div className="record-head">
        <p className="record-title">{primaryText(record)}</p>
        <span className={`status ${statusClass[record.status] || ""}`}>{record.status}</span>
      </div>
      <div className="details">
        {fields.map((field) => (
          <span key={field.key}>{field.label}: {String(record[field.key] ?? "")}</span>
        ))}
      </div>
      <p className="note">{record.notes}</p>

      {record.status === "异常" && rect && (
        <div className="rect-panel">
          <div className="details rect-details">
            <span>整改责任人: {rect.responsible}</span>
            <span>整改期限: {rect.deadline}</span>
            <span>临时安全措施: {rect.safetyMeasures}</span>
          </div>
          <div className="progress">
            {progressFlow.map((step, index) => (
              <span key={step} className={`step${index <= progressIndex ? " step-active" : ""}`}>{step}</span>
            ))}
          </div>
          {overdue && <p className="overdue">已逾期，未在整改期限内闭环</p>}
          {rect.progress === progressFlow[2] && (
            <p className="resolution">处理说明: {rect.resolution}{rect.closedAt ? `（闭环于 ${rect.closedAt}）` : ""}</p>
          )}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {mode === "anomaly" && (
        <div className="inline-form">
          <label>
            整改责任人
            <input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} placeholder="必填" />
          </label>
          <label>
            整改期限
            <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
          </label>
          <label>
            临时安全措施
            <textarea value={draft.safetyMeasures} onChange={(event) => setDraft({ ...draft, safetyMeasures: event.target.value })} placeholder="如：停机、围挡、悬挂警示牌" />
          </label>
          <div className="actions">
            <button type="button" onClick={submitAnomaly}>确认登记异常</button>
            <button className="secondary" type="button" onClick={resetInline}>取消</button>
          </div>
        </div>
      )}

      {mode === "close" && (
        <div className="inline-form">
          <label>
            处理说明（闭环必填）
            <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="说明整改结果与复查情况" />
          </label>
          <div className="actions">
            <button type="button" onClick={submitClose}>确认闭环</button>
            <button className="secondary" type="button" onClick={resetInline}>取消</button>
          </div>
        </div>
      )}

      <div className="actions">
        {record.status === "未检" && (
          <button
            type="button"
            disabled={areaLocked}
            title={areaLocked ? "该区域存在未闭环异常，不得标记正常" : undefined}
            onClick={markNormal}
          >
            标记正常
          </button>
        )}
        {record.status !== "异常" && mode !== "anomaly" && (
          <button className="secondary" type="button" onClick={() => { setMode("anomaly"); setError(""); }}>
            登记异常
          </button>
        )}
        {record.status === "异常" && rect && rect.progress !== progressFlow[2] && mode !== "close" && (
          <button type="button" onClick={advanceProgress}>
            {rect.progress === progressFlow[0] ? "开始整改" : "闭环整改"}
          </button>
        )}
        <button className="secondary" type="button" onClick={() => navigator.clipboard?.writeText(primaryText(record))}>
          复制摘要
        </button>
        <button
          className="danger"
          type="button"
          disabled={openAnomaly}
          title={openAnomaly ? "未闭环异常不可移除" : undefined}
          onClick={onRemove}
        >
          删除
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [records, setRecords] = useState<RecordItem[]>(loadRecords);
  const [form, setForm] = useState<Record<string, string | number>>(createBlank);
  const [result, setResult] = useState<string>(statuses[0]);
  const [rectForm, setRectForm] = useState(blankRectification);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<string>(project.filters[0]);
  const [formError, setFormError] = useState("");

  const selectedArea = String(form.area || "");
  const areaAnomalies = useMemo(
    () => (selectedArea ? openAnomaliesInArea(records, selectedArea) : []),
    [records, selectedArea]
  );
  const areaLocked = areaAnomalies.length > 0;
  const earliestFound = areaLocked ? earliestDiscovery(areaAnomalies) : "";

  // 区域被锁定后，已选的“正常”结果自动回退，避免绕过限制
  useEffect(() => {
    if (areaLocked && result === "正常") setResult(statuses[0]);
  }, [areaLocked, result]);

  const filteredRecords = useMemo(() => {
    if (filter.startsWith("全部")) return records;
    return records.filter((record) => Object.values(record).includes(filter));
  }, [filter, records]);

  const metrics = useMemo(() => {
    const total = records.length;
    const anomalies = records.filter((record) => record.status === "异常").length;
    const checked = records.filter((record) => record.status !== statuses[0]).length;
    const overdueOpen = records.filter(isOverdue).length;
    return [total, anomalies, checked, overdueOpen];
  }, [records]);

  const lockedAreas = useMemo(
    () => [...new Set(records.filter(isOpenAnomaly).map((record) => String(record.area)))],
    [records]
  );

  const chartRows = statuses.map((status) => ({
    status,
    value: records.filter((record) => record.status === status).length
  }));
  const maxChart = Math.max(1, ...chartRows.map((row) => row.value));

  function updateRecords(next: RecordItem[]) {
    setRecords(next);
    saveRecords(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const checkedAt = String(form.checkedAt || "");
    if (areaLocked && result === "正常") {
      setFormError("该区域存在未闭环异常，新增记录不得选“正常”");
      return;
    }
    if (areaLocked && checkedAt && checkedAt < earliestFound) {
      setFormError(`新增巡检日期不得早于异常发现日期（${earliestFound}）`);
      return;
    }
    if (result === "异常" && (!rectForm.responsible.trim() || !rectForm.deadline || !rectForm.safetyMeasures.trim())) {
      setFormError("发现异常时必须登记整改责任人、整改期限和临时安全措施");
      return;
    }
    const next: RecordItem = {
      ...form,
      id: crypto.randomUUID(),
      status: result,
      notes: note || "暂无备注",
      createdAt: new Date().toISOString(),
      ...(result === "异常"
        ? {
            rectification: {
              responsible: rectForm.responsible.trim(),
              deadline: rectForm.deadline,
              safetyMeasures: rectForm.safetyMeasures.trim(),
              progress: progressFlow[0],
              resolution: ""
            }
          }
        : {})
    };
    updateRecords([next, ...records]);
    setForm(createBlank());
    setNote("");
    setResult(statuses[0]);
    setRectForm(blankRectification());
  }

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{project.industry}行业前端最小闭环</p>
            <h1>{project.title}</h1>
            <p className="subtitle">{project.subtitle}</p>
          </div>
          <div className="stack">{project.stack.map((item) => <span className="tag" key={item}>{item}</span>)}</div>
        </header>

        <section className="metrics">
          {project.metricLabels.map((label, index) => (
            <article className={`metric${label === "逾期未闭环" && metrics[index] > 0 ? " metric-danger" : ""}`} key={label}>
              <span>{label}</span>
              <strong>{metrics[index]}</strong>
            </article>
          ))}
        </section>

        <section className="workspace">
          <form className="panel" onSubmit={handleSubmit}>
            <h2>{project.formTitle}</h2>
            <div className="form-grid">
              {fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  {field.type === "select" ? (
                    <select
                      value={String(form[field.key])}
                      onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                      required
                    >
                      <option value="">请选择</option>
                      {field.options?.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={form[field.key]}
                      min={field.type === "date" && earliestFound ? earliestFound : undefined}
                      onChange={(event) =>
                        setForm({ ...form, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value })
                      }
                      required
                    />
                  )}
                </label>
              ))}
              <label>
                巡检结果
                <select value={result} onChange={(event) => setResult(event.target.value)}>
                  {statuses.map((status) => (
                    <option key={status} value={status} disabled={status === "正常" && areaLocked}>
                      {status}{status === "正常" && areaLocked ? "（区域未闭环，不可选）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {areaLocked && (
                <p className="lock-hint">
                  该区域存在未闭环异常（发现于 {earliestFound}）：新增记录不得选“正常”，巡检日期不得早于发现日期，原异常不可移除。
                </p>
              )}
              {result === "异常" && (
                <>
                  <label>
                    整改责任人
                    <input
                      value={rectForm.responsible}
                      onChange={(event) => setRectForm({ ...rectForm, responsible: event.target.value })}
                      placeholder="必填"
                      required
                    />
                  </label>
                  <label>
                    整改期限
                    <input
                      type="date"
                      value={rectForm.deadline}
                      onChange={(event) => setRectForm({ ...rectForm, deadline: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    临时安全措施
                    <textarea
                      value={rectForm.safetyMeasures}
                      onChange={(event) => setRectForm({ ...rectForm, safetyMeasures: event.target.value })}
                      placeholder="如：停机、围挡、悬挂警示牌"
                      required
                    />
                  </label>
                </>
              )}
              <label>
                备注
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="填写处理说明或现场备注" />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button type="submit">{project.primaryAction}</button>
            </div>
          </form>

          <section className="list-panel">
            <div className="toolbar">
              <h2>{project.entityLabel}列表</h2>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                {project.filters.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>

            {lockedAreas.length > 0 && (
              <p className="lock-hint">
                区域锁定：{lockedAreas.join("、")} 存在未闭环异常，闭环前该区域新增记录不得选“正常”，原异常不可移除。
              </p>
            )}

            <div className="record-grid">
              {filteredRecords.length === 0 ? <div className="empty">暂无匹配数据</div> : filteredRecords.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  areaLocked={openAnomaliesInArea(records, String(record.area)).length > 0}
                  onChange={(next) => updateRecords(records.map((item) => (item.id === next.id ? next : item)))}
                  onRemove={() => updateRecords(records.filter((item) => item.id !== record.id))}
                />
              ))}
            </div>

            <div className="mini-chart">
              {chartRows.map((row) => (
                <div className="bar" key={row.status}>
                  <span>{row.status}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(row.value / maxChart) * 100}%` }} /></div>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
