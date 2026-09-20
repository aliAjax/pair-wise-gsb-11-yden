import { FormEvent, useMemo, useState } from "react";

type InspectionStatus = "正常" | "异常";
type RectifyStage = "待整改" | "整改中" | "已闭环";

type Field = {
  key: string;
  label: string;
  type?: "number" | "date" | "select";
  options?: string[];
};

type RecordItem = {
  id: string;
  item: string;
  area: string;
  inspector: string;
  checkedAt: string;
  status: InspectionStatus;
  notes: string;
  createdAt: string;
  // —— 异常整改闭环字段 ——
  owner?: string; // 整改责任人
  deadline?: string; // 整改期限
  safetyMeasure?: string; // 临时安全措施
  stage?: RectifyStage; // 整改进度
  closeNote?: string; // 闭环处理说明
  closedAt?: string; // 闭环时间
  [key: string]: string | number | undefined;
};

type FormState = {
  item: string;
  area: string;
  inspector: string;
  checkedAt: string;
  status: InspectionStatus;
  owner: string;
  deadline: string;
  safetyMeasure: string;
};

const project = {
  number: 10,
  folder: "dfwl/frontend/dfwlfront-10",
  framework: "react",
  title: "油站设备巡检清单",
  subtitle: "登记巡检结果，异常必须落实整改责任人、期限与临时安全措施，形成「发现—整改—闭环」管理。",
  industry: "石油",
  stack: ["React", "Vite", "TypeScript", "Zustand", "Ant Design"],
  storageKey: "dfwlfront-10-inspection-v2",
  formTitle: "新增巡检记录",
  primaryAction: "提交巡检",
  entityLabel: "巡检记录",
  filters: ["全部区域", "加油区", "油罐区", "收银区"]
} as const;

const AREAS = ["加油区", "油罐区", "收银区"];
const STAGES: RectifyStage[] = ["待整改", "整改中", "已闭环"];

const fields: Field[] = [
  { key: "item", label: "巡检项" },
  { key: "area", label: "区域", type: "select", options: AREAS },
  { key: "inspector", label: "巡检人" },
  { key: "checkedAt", label: "巡检日期", type: "date" }
];

const seedRecords: RecordItem[] = [
  {
    id: "seed-1",
    item: "加油机1号",
    area: "加油区",
    inspector: "何鑫",
    checkedAt: "2026-09-19",
    status: "正常",
    notes: "运行正常，油枪、胶管无渗漏。",
    createdAt: "2026-09-19T09:10:00.000Z"
  },
  {
    id: "seed-2",
    item: "卸油口密封",
    area: "油罐区",
    inspector: "何鑫",
    checkedAt: "2026-09-16",
    status: "异常",
    notes: "密封圈老化，卸油时有轻微渗油痕迹。",
    owner: "李建国",
    deadline: "2026-09-18",
    safetyMeasure: "该卸油口加装临时接油盘并悬挂警示牌，暂停此口卸油作业。",
    stage: "待整改",
    createdAt: "2026-09-16T10:30:00.000Z"
  },
  {
    id: "seed-3",
    item: "8kg干粉灭火器压力",
    area: "加油区",
    inspector: "周敏",
    checkedAt: "2026-09-12",
    status: "异常",
    notes: "加油岛东侧灭火器压力表指针进入红区。",
    owner: "王强",
    deadline: "2026-09-25",
    safetyMeasure: "点位先更换备用灭火器，原器件围挡隔离待充装。",
    stage: "整改中",
    createdAt: "2026-09-12T15:05:00.000Z"
  },
  {
    id: "seed-4",
    item: "收银台POS机",
    area: "收银区",
    inspector: "陈丽",
    checkedAt: "2026-09-19",
    status: "正常",
    notes: "签到、银行卡与扫码对账均正常。",
    createdAt: "2026-09-19T08:45:00.000Z"
  }
];

const blankForm: FormState = {
  item: "",
  area: "",
  inspector: "",
  checkedAt: "",
  status: "正常",
  owner: "",
  deadline: "",
  safetyMeasure: ""
};

function todayStr() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isOpenAbnormal(record: RecordItem) {
  return record.status === "异常" && record.stage !== "已闭环";
}

function isOverdue(record: RecordItem, today = todayStr()) {
  return isOpenAbnormal(record) && !!record.deadline && record.deadline < today;
}

function normalize(raw: RecordItem): RecordItem {
  if (raw.status === "异常" && !raw.stage) {
    return { ...raw, stage: "待整改" };
  }
  return raw;
}

function loadRecords(): RecordItem[] {
  const raw = localStorage.getItem(project.storageKey);
  if (!raw) return seedRecords;
  try {
    const parsed = JSON.parse(raw) as RecordItem[];
    return Array.isArray(parsed) ? parsed.map(normalize) : seedRecords;
  } catch {
    return seedRecords;
  }
}

function saveRecords(records: RecordItem[]) {
  localStorage.setItem(project.storageKey, JSON.stringify(records));
}

function primaryText(record: RecordItem) {
  return [record.item, record.area].filter(Boolean).join(" / ") || project.entityLabel;
}

export default function App() {
  const [records, setRecords] = useState<RecordItem[]>(loadRecords);
  const [form, setForm] = useState<FormState>(blankForm);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<string>(project.filters[0]);
  const [formError, setFormError] = useState("");
  const [closeDrafts, setCloseDrafts] = useState<Record<string, string>>({});

  const today = todayStr();

  // 区域 -> 该区域最早一条未闭环异常的发现（巡检）日期
  const areaLockMap = useMemo(() => {
    const map = new Map<string, string>();
    records.filter(isOpenAbnormal).forEach((record) => {
      const known = map.get(record.area);
      if (!known || record.checkedAt < known) map.set(record.area, record.checkedAt);
    });
    return map;
  }, [records]);

  const overdueRecords = useMemo(
    () => records.filter((record) => isOverdue(record, today)),
    [records, today]
  );

  const openRecords = useMemo(() => records.filter(isOpenAbnormal), [records]);
  const closedRecords = useMemo(
    () => records.filter((record) => record.status === "异常" && record.stage === "已闭环"),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const matched = filter.startsWith("全部")
      ? records
      : records.filter((record) => record.area === filter);
    return [...matched].sort((a, b) => {
      const weight = Number(isOpenAbnormal(b)) - Number(isOpenAbnormal(a));
      if (weight !== 0) return weight;
      return b.checkedAt.localeCompare(a.checkedAt);
    });
  }, [filter, records]);

  const metrics = [records.length, openRecords.length, closedRecords.length];
  const metricLabels = ["巡检记录", "未闭环异常", "已闭环异常"];

  const resultRows = ["正常", "异常"].map((status) => ({
    label: status,
    value: records.filter((record) => record.status === status).length
  }));
  const stageRows = STAGES.map((stage) => ({
    label: stage,
    value: records.filter((record) => record.status === "异常" && record.stage === stage).length
  }));
  const maxChart = Math.max(1, ...resultRows.map((row) => row.value), ...stageRows.map((row) => row.value));

  const lockDate = form.area ? areaLockMap.get(form.area) : undefined;
  const areaLocked = !!lockDate;
  const formIsAbnormal = form.status === "异常";

  function updateRecords(next: RecordItem[]) {
    setRecords(next);
    saveRecords(next);
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // 选择被锁定的区域时，正常选项不可用，强制回到「异常」登记
      if (patch.area !== undefined && areaLockMap.has(next.area)) {
        next.status = "异常";
      }
      return next;
    });
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.item.trim()) return setFormError("请填写巡检项。");
    if (!form.area) return setFormError("请选择区域。");
    if (!form.inspector.trim()) return setFormError("请填写巡检人。");
    if (!form.checkedAt) return setFormError("请选择巡检日期。");

    const currentLock = areaLockMap.get(form.area);
    if (currentLock && form.checkedAt < currentLock) {
      return setFormError(`该区域存在 ${currentLock} 发现的未闭环异常，新增巡检日期不得早于该日期。`);
    }
    if (currentLock && form.status === "正常") {
      return setFormError("该区域存在未闭环异常，异常闭环前不得登记「正常」。");
    }

    if (form.status === "异常") {
      if (!form.owner.trim()) return setFormError("发现异常必须登记整改责任人。");
      if (!form.deadline) return setFormError("发现异常必须填写整改期限。");
      if (form.deadline < form.checkedAt) {
        return setFormError("整改期限不得早于巡检（发现）日期。");
      }
      if (!form.safetyMeasure.trim()) return setFormError("发现异常必须落实临时安全措施。");
    }

    const now = new Date().toISOString();
    const next: RecordItem = {
      id: crypto.randomUUID(),
      item: form.item.trim(),
      area: form.area,
      inspector: form.inspector.trim(),
      checkedAt: form.checkedAt,
      status: form.status,
      notes: note.trim() || (form.status === "异常" ? "异常现象详见整改信息。" : "无异常。"),
      createdAt: now,
      ...(form.status === "异常"
        ? {
            owner: form.owner.trim(),
            deadline: form.deadline,
            safetyMeasure: form.safetyMeasure.trim(),
            stage: "待整改" as RectifyStage
          }
        : {})
    };
    updateRecords([next, ...records]);
    setForm(blankForm);
    setNote("");
    setFormError("");
  }

  function advanceStage(target: RecordItem) {
    if (target.stage !== "待整改") return;
    updateRecords(
      records.map((record) =>
        record.id === target.id ? { ...record, stage: "整改中" } : record
      )
    );
  }

  function closeLoop(target: RecordItem) {
    const closeNote = (closeDrafts[target.id] || "").trim();
    if (!closeNote) return;
    updateRecords(
      records.map((record) =>
        record.id === target.id
          ? { ...record, stage: "已闭环", closeNote, closedAt: new Date().toISOString() }
          : record
      )
    );
    setCloseDrafts((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
  }

  function removeRecord(target: RecordItem) {
    // 区域存在未闭环异常时，原异常记录不得移除
    if (isOpenAbnormal(target)) return;
    updateRecords(records.filter((record) => record.id !== target.id));
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

        {overdueRecords.length > 0 && (
          <section className="alert" role="alert">
            <div className="alert-main">
              <strong>逾期未闭环异常 {overdueRecords.length} 项</strong>
              <span>已超过整改期限仍未闭环，请立即督办：</span>
            </div>
            <ul className="alert-list">
              {overdueRecords.map((record) => (
                <li key={record.id}>
                  {record.area} · {record.item}
                  <em>期限 {record.deadline}</em>
                  <em>责任人 {record.owner || "—"}</em>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="metrics">
          {metricLabels.map((label, index) => (
            <article
              className={`metric ${label === "未闭环异常" && metrics[index] > 0 ? "metric-warn" : ""}`}
              key={label}
            >
              <span>{label}</span>
              <strong>{metrics[index]}</strong>
            </article>
          ))}
        </section>

        <section className="workspace">
          <form className="panel" onSubmit={handleSubmit} noValidate>
            <h2>{project.formTitle}</h2>
            <div className="form-grid">
              <label>
                巡检项
                <input
                  value={form.item}
                  onChange={(event) => patchForm({ item: event.target.value })}
                  placeholder="如：加油机2号"
                  required
                />
              </label>

              <label>
                区域
                <select value={form.area} onChange={(event) => patchForm({ area: event.target.value })} required>
                  <option value="">请选择</option>
                  {AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                      {areaLockMap.has(area) ? "（异常未闭环）" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                巡检人
                <input
                  value={form.inspector}
                  onChange={(event) => patchForm({ inspector: event.target.value })}
                  placeholder="填写巡检人姓名"
                  required
                />
              </label>

              <label>
                巡检日期
                <input
                  type="date"
                  value={form.checkedAt}
                  min={lockDate}
                  max={today}
                  onChange={(event) => patchForm({ checkedAt: event.target.value })}
                  required
                />
                {lockDate && (
                  <small className="hint">该区域 {lockDate} 发现的异常尚未闭环，巡检日期不得早于此日期。</small>
                )}
              </label>

              <label>
                巡检结果
                <select
                  value={form.status}
                  onChange={(event) => patchForm({ status: event.target.value as InspectionStatus })}
                >
                  <option value="正常" disabled={areaLocked}>
                    正常{areaLocked ? "（区域锁定中，不可选）" : ""}
                  </option>
                  <option value="异常">异常</option>
                </select>
                {areaLocked && (
                  <small className="hint">该区域存在未闭环异常，仅可继续登记异常，闭环后恢复「正常」选项。</small>
                )}
              </label>

              {formIsAbnormal && (
                <div className="rectify-form">
                  <p className="rectify-title">异常整改登记（必填）</p>
                  <label>
                    整改责任人
                    <input
                      value={form.owner}
                      onChange={(event) => patchForm({ owner: event.target.value })}
                      placeholder="指定整改责任人"
                    />
                  </label>
                  <label>
                    整改期限
                    <input
                      type="date"
                      value={form.deadline}
                      min={form.checkedAt || undefined}
                      onChange={(event) => patchForm({ deadline: event.target.value })}
                    />
                  </label>
                  <label>
                    临时安全措施
                    <textarea
                      value={form.safetyMeasure}
                      onChange={(event) => patchForm({ safetyMeasure: event.target.value })}
                      placeholder="如：停用挂牌、围挡警示、更换备用设备等"
                    />
                  </label>
                </div>
              )}

              <label>
                现场备注
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录巡检现象或补充说明" />
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

            <div className="record-grid">
              {filteredRecords.length === 0 ? (
                <div className="empty">暂无匹配数据</div>
              ) : (
                filteredRecords.map((record) => {
                  const locked = isOpenAbnormal(record);
                  const overdue = isOverdue(record, today);
                  const draft = closeDrafts[record.id] || "";
                  return (
                    <article className={`record ${record.status === "异常" ? "record-abnormal" : ""}`} key={record.id}>
                      <div className="record-head">
                        <p className="record-title">{primaryText(record)}</p>
                        {record.status === "正常" ? (
                          <span className="status status-ok">正常</span>
                        ) : (
                          <span className={`status stage-${record.stage}`}>
                            异常 · {record.stage}
                            {overdue && <b className="overdue-flag">逾期</b>}
                          </span>
                        )}
                      </div>

                      <div className="details">
                        {fields.map((field) => (
                          <span key={field.key}>{field.label}: {String(record[field.key] ?? "")}</span>
                        ))}
                      </div>

                      <p className="note">{record.notes}</p>

                      {record.status === "异常" && (
                        <div className="rectify">
                          <div className="details rectify-details">
                            <span>整改责任人: {record.owner || "—"}</span>
                            <span className={overdue ? "text-danger" : ""}>
                              整改期限: {record.deadline || "—"}{overdue ? "（已逾期）" : ""}
                            </span>
                          </div>
                          <p className="measure">
                            <b>临时安全措施：</b>{record.safetyMeasure || "—"}
                          </p>

                          <div className="steps">
                            {STAGES.map((stage, index) => {
                              const activeIndex = STAGES.indexOf(record.stage || "待整改");
                              const active = index <= activeIndex;
                              return (
                                <span className={`step ${active ? "step-active" : ""}`} key={stage}>
                                  {index + 1}. {stage}
                                </span>
                              );
                            })}
                          </div>

                          {record.stage === "待整改" && (
                            <div className="actions">
                              <button type="button" onClick={() => advanceStage(record)}>开始整改</button>
                            </div>
                          )}

                          {record.stage === "整改中" && (
                            <div className="close-box">
                              <label>
                                闭环处理说明（必填）
                                <textarea
                                  value={draft}
                                  onChange={(event) =>
                                    setCloseDrafts((prev) => ({ ...prev, [record.id]: event.target.value }))
                                  }
                                  placeholder="说明整改措施、更换备件、验收人及验收结果"
                                />
                              </label>
                              <button type="button" disabled={!draft.trim()} onClick={() => closeLoop(record)}>
                                确认闭环
                              </button>
                            </div>
                          )}

                          {record.stage === "已闭环" && (
                            <div className="closed">
                              <p><b>处理说明：</b>{record.closeNote}</p>
                              <small>闭环时间：{record.closedAt ? record.closedAt.slice(0, 10) : "—"}</small>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="actions">
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(primaryText(record))}
                        >
                          复制摘要
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={locked}
                          title={locked ? "未闭环异常不得移除，闭环后方可删除" : "删除该记录"}
                          onClick={() => removeRecord(record)}
                        >
                          {locked ? "异常未闭环，禁止移除" : "删除"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="charts">
              <div className="mini-chart">
                <p className="chart-title">巡检结果</p>
                {resultRows.map((row) => (
                  <div className="bar" key={row.label}>
                    <span>{row.label}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(row.value / maxChart) * 100}%` }} /></div>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
              <div className="mini-chart">
                <p className="chart-title">整改进度（异常）</p>
                {stageRows.map((row) => (
                  <div className="bar" key={row.label}>
                    <span>{row.label}</span>
                    <div className="bar-track">
                      <div className={`bar-fill bar-${row.label}`} style={{ width: `${(row.value / maxChart) * 100}%` }} />
                    </div>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
