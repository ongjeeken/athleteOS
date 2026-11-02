import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Plus,
} from "lucide-react";
import {
  categories,
  historySchema,
  type Data,
  type Dataset,
  type HistoricalRecord,
  type WeeklyRule,
} from "../domain/models";
import { addDays, dateRange, fmt, weekStart } from "../domain/dates";
import {
  candidateFromStored,
  exceptionalRecord,
  saveReviewedHistory,
  saveSetup,
  skipHistory,
} from "../history-storage";
import { initialSetup } from "../domain/setup";
import {
  detectDuplicates,
  sortCandidates,
  reconstruct,
  type Candidate,
} from "../domain/history";
import {
  csvCandidates,
  csvFields,
  defaultImportOptions,
  icsCandidates,
  parseCsvTable,
  type CsvMapping,
  type CsvTable,
  type ImportOptions,
} from "../domain/import-history";
import { ActivityDaySelector } from "../components/activity-day-selector";
import {
  Badge,
  ErrorMessage,
  Field,
  Modal,
  SectionTitle,
} from "../components/ui";
import { RpeInput } from "../components/rpe";
import { errorText } from "../components/forms";
export type HistoryStage =
  "choice" | "weekly" | "import" | "review" | "template";
export function HistoryChoices({
  onChoose,
  onSkip,
}: {
  onChoose: (stage: HistoryStage) => void;
  onSkip: () => void;
}) {
  return (
    <section className="history-choices panel">
      <SectionTitle
        title="Start with the training you remember"
        detail="Optional history can add context. You can use AthleteOS right away."
      />
      <div className="history-paths">
        <button
          className="history-path recommended"
          onClick={() => onChoose("weekly")}
        >
          <span className="row">
            <CalendarDays size={21} />
            <Badge>Recommended</Badge>
          </span>
          <h3>Reconstruct My Recent Training</h3>
          <p>Use your typical week to review the last 2–6 weeks.</p>
          <span className="text-button">
            Review a recent routine <ArrowRight size={14} />
          </span>
        </button>
        <button className="history-path" onClick={() => onChoose("import")}>
          <FileUp size={21} />
          <h3>Import existing training</h3>
          <p>Preview a local CSV or ICS file. You decide what belongs.</p>
          <span className="text-button">
            Choose a file <ArrowRight size={14} />
          </span>
        </button>
        <button className="history-path" onClick={onSkip}>
          <ArrowRight size={21} />
          <h3>Start from today</h3>
          <p>
            Keep your provisional plan and build actual history as you train.
          </p>
          <span className="text-button">
            Skip historical data <ArrowRight size={14} />
          </span>
        </button>
      </div>
    </section>
  );
}
export function QuickStartPage({
  data,
  dataset,
  date,
  initialStage = "choice",
  onDone,
  onNotify,
}: {
  data: Data;
  dataset: Dataset;
  date: string;
  initialStage?: HistoryStage;
  onDone: () => void;
  onNotify: (s: string) => void;
}) {
  const [stage, setStage] = useState<HistoryStage>(initialStage),
    [rules, setRules] = useState<WeeklyRule[]>(data.profile?.weeklyRules ?? []),
    [rest, setRest] = useState(data.profile?.restDays ?? []),
    [unavailable, setUnavailable] = useState(
      data.profile?.unavailableWeekdays ?? [],
    ),
    [weeks, setWeeks] = useState(4),
    [rows, setRows] = useState<Candidate[]>(() =>
      data.history
        .filter((h) => h.status === "unconfirmed" || h.status === "missed")
        .map(candidateFromStored)
        .sort((a, b) =>
          (a.date + a.time + a.title).localeCompare(b.date + b.time + b.title),
        ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [warnings, setWarnings] = useState<string[]>([]);
  const [file, setFile] = useState<{
      name: string;
      text: string;
      kind: "csv" | "ics";
    }>(),
    [table, setTable] = useState<CsvTable>(),
    [mapping, setMapping] = useState<CsvMapping>(),
    [options, setOptions] = useState<ImportOptions>(() =>
      defaultImportOptions(dataset, data.profile!.timezone, date),
    ),
    [drag, setDrag] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  function preview(result: { records: Candidate[]; warnings: string[] }) {
    setRows(sortCandidates(detectDuplicates(result.records, data)));
    setWarnings(result.warnings);
    setStage("review");
    setError("");
  }
  async function receive(f: File) {
    try {
      setError("");
      if (f.size > 8 * 1024 * 1024)
        throw new Error("Choose a CSV or ICS file smaller than 8 MB.");
      const ext = f.name.split(".").at(-1)?.toLowerCase();
      if (ext !== "csv" && ext !== "ics")
        throw new Error("Choose an .ics calendar or .csv spreadsheet.");
      const text = await f.text();
      setFile({ name: f.name, text, kind: ext });
      if (ext === "csv") {
        const parsed = parseCsvTable(text);
        setTable(parsed);
        setMapping(parsed.mapping);
      } else {
        setTable(undefined);
        setMapping(undefined);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function skip() {
    try {
      await skipHistory(dataset);
      onDone();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await saveReviewedHistory(rows, dataset, date);
      onNotify(
        `${result.completed} completed session${result.completed === 1 ? "" : "s"} added. ${result.saved - result.completed} other records saved.${result.duplicates ? " " + result.duplicates + " duplicates skipped." : ""}`,
      );
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="quick-start-page">
      <button
        className="text-button"
        onClick={
          stage === "choice"
            ? onDone
            : () => {
                setStage("choice");
                setError("");
              }
        }
      >
        <ArrowLeft size={15} />
        {stage === "choice" ? "Back to Today" : "All Quick Start options"}
      </button>
      {stage === "choice" && (
        <>
          <HistoryChoices
            onChoose={(s) => {
              setStage(s);
              setError("");
            }}
            onSkip={() => void skip()}
          />
          {data.history.some((r) => r.status !== "completed") && (
            <button
              className="button"
              onClick={() => {
                setRows(
                  data.history
                    .filter((h) => h.status !== "completed")
                    .map(candidateFromStored)
                    .sort((a, b) =>
                      (a.date + a.time + a.title).localeCompare(
                        b.date + b.time + b.title,
                      ),
                    ),
                );
                setStage("review");
              }}
            >
              Review saved historical records
            </button>
          )}
        </>
      )}
      {(stage === "weekly" || stage === "template") && (
        <section className="panel">
          <SectionTitle
            title={
              stage === "template"
                ? "Your typical training week"
                : "Reconstruct My Recent Training"
            }
            detail={
              stage === "template"
                ? "Save your usual routine for reuse. Existing plans and completed training stay unchanged."
                : "Use a normal week as a starting point. Every past occurrence will need review."
            }
          />
          <ActivityDaySelector
            context={stage === "weekly" ? "history" : "future"}
            onUseUsual={() => {
              setRules(data.profile?.weeklyRules ?? []);
              setRest(data.profile?.restDays ?? []);
              setUnavailable(data.profile?.unavailableWeekdays ?? []);
            }}
            rules={rules}
            restDays={rest}
            unavailableDays={unavailable}
            onChange={(r, s, u) => {
              setRules(r);
              setRest(s);
              setUnavailable(u);
            }}
          />
          {stage === "weekly" ? (
            <div className="reconstruction-actions">
              <Field label="How far back?">
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                >
                  <option value={2}>Previous 2 weeks</option>
                  <option value={4}>Previous 4 weeks</option>
                  <option value={6}>Previous 6 weeks</option>
                </select>
              </Field>
              <button
                className="button primary"
                onClick={() => {
                  try {
                    const active = rules
                      .map((r) => ({
                        ...r,
                        days: r.days.filter(
                          (d) => !rest.includes(d) && !unavailable.includes(d),
                        ),
                      }))
                      .filter((r) => r.days.length);
                    const result = reconstruct(
                      active,
                      weeks,
                      addDays(date, -1),
                      dataset,
                    ).map((r) => ({
                      ...r,
                      sourceTimezone: data.profile!.timezone,
                    }));
                    preview({ records: result, warnings: [] });
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Generate proposed history <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="form-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await saveSetup(
                      {
                        ...initialSetup(dataset, data.profile!.timezone),
                        name: data.profile!.name,
                        primaryGoal:
                          data.profile!.primaryGoal ??
                          "Balanced athletic development",
                        secondaryGoals: data.profile!.secondaryGoals ?? [],
                        rules,
                        restDays: rest,
                        unavailableDays: unavailable,
                      },
                      date,
                      true,
                    );
                    onNotify(
                      "Usual training week saved. Existing plans and history are unchanged.",
                    );
                    onDone();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save typical week
              </button>
            </div>
          )}
        </section>
      )}
      {stage === "import" && (
        <section className="panel">
          <SectionTitle
            title="Bring your history with you"
            detail="Files are parsed on this device. Nothing is uploaded."
          />
          <div
            className={`history-dropzone ${drag ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void receive(f);
            }}
          >
            <FileUp size={28} />
            <h3>Drop an ICS or CSV file here</h3>
            <p>Calendar or spreadsheet exports · up to 8 MB</p>
            <button className="button" onClick={() => upload.current?.click()}>
              Choose local file
            </button>
            <input
              className="visually-hidden"
              ref={upload}
              type="file"
              accept=".ics,.csv,text/calendar,text/csv"
              aria-label="Historical data file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void receive(f);
                e.target.value = "";
              }}
            />
            {file && (
              <strong className="file-name">Selected: {file.name}</strong>
            )}
          </div>
          {file && (
            <>
              <div className="form-grid import-options">
                <Field label="From">
                  <input
                    type="date"
                    value={options.from}
                    max={options.to}
                    onChange={(e) =>
                      setOptions({ ...options, from: e.target.value })
                    }
                  />
                </Field>
                <Field label="Through">
                  <input
                    type="date"
                    value={options.to}
                    min={options.from}
                    max={addDays(date, -1)}
                    onChange={(e) =>
                      setOptions({ ...options, to: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Source timezone"
                  hint={`Times will be shown in ${options.athleteTimezone}`}
                >
                  <input
                    value={options.sourceTimezone}
                    onChange={(e) =>
                      setOptions({ ...options, sourceTimezone: e.target.value })
                    }
                  />
                </Field>
                {file.kind === "csv" && (
                  <>
                    <Field label="Day / month order">
                      <select
                        value={options.dateOrder}
                        onChange={(e) =>
                          setOptions({
                            ...options,
                            dateOrder: e.target
                              .value as ImportOptions["dateOrder"],
                          })
                        }
                      >
                        <option value="auto">
                          Detect safely (ambiguous dates need a choice)
                        </option>
                        <option value="DMY">Day / month / year</option>
                        <option value="MDY">Month / day / year</option>
                      </select>
                    </Field>
                    <Field label="Duration unit">
                      <select
                        value={options.durationUnit}
                        onChange={(e) =>
                          setOptions({
                            ...options,
                            durationUnit: e.target
                              .value as ImportOptions["durationUnit"],
                          })
                        }
                      >
                        <option value="auto">
                          Use column name; otherwise minutes
                        </option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="seconds">Seconds</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>
              {file.kind === "ics" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={options.allowUnknownTimezone ?? false}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        allowUnknownTimezone: e.target.checked,
                      })
                    }
                  />
                  Use source timezone as a fallback for unsupported TZIDs (with
                  warnings)
                </label>
              )}
              {table && mapping && (
                <div className="csv-mapping">
                  <SectionTitle
                    title="Match your columns"
                    detail="Recognized headers are mapped. Correct anything that doesn’t fit."
                  />
                  <div className="form-grid">
                    {csvFields.map((field) => (
                      <Field
                        key={field}
                        label={
                          field === "date"
                            ? "Start date column"
                            : field === "title"
                              ? "Title column"
                              : field === "rpe"
                                ? "RPE column (optional)"
                                : field.charAt(0).toUpperCase() +
                                  field.slice(1) +
                                  " column (optional)"
                        }
                      >
                        <select
                          value={mapping[field]}
                          onChange={(e) =>
                            setMapping({ ...mapping, [field]: e.target.value })
                          }
                        >
                          <option value="">Not provided</option>
                          {table.headers.map((h) => (
                            <option key={h}>{h}</option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                  <p className="helper">
                    RPE is never inferred. File completion labels do not verify
                    attendance. Review active exercise time rather than total
                    time at the venue.
                  </p>
                </div>
              )}
              <div className="form-actions">
                <button
                  className="button primary"
                  onClick={() => {
                    try {
                      if (
                        !options.from ||
                        !options.to ||
                        options.from > options.to ||
                        options.to >= date
                      )
                        throw new Error(
                          "Choose a historical date range ending before today.",
                        );
                      preview(
                        file.kind === "ics"
                          ? icsCandidates(file.text, options, file.name)
                          : csvCandidates(table!, mapping!, options, file.name),
                      );
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  Preview records <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {stage === "review" && (
        <>
          <HistoryReview
            rows={rows}
            setRows={setRows}
            date={date}
            dataset={dataset}
            defaultMode={data.profile!.defaultRpeMode}
          />
          {warnings.length > 0 && (
            <details className="import-warnings" open>
              <summary>
                {warnings.length} import warning
                {warnings.length === 1 ? "" : "s"} — review skipped or ambiguous
                entries
              </summary>
              {warnings.slice(0, 50).map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              {warnings.length > 50 && (
                <p>
                  {warnings.length - 50} more warnings. Narrow the date range or
                  correct the source file.
                </p>
              )}
            </details>
          )}
          <div className="history-save-bar">
            <div>
              <strong>
                {
                  rows.filter(
                    (r) =>
                      r.included &&
                      r.status === "completed" &&
                      r.kind === "session",
                  ).length
                }{" "}
                completed sessions
              </strong>
              <p>
                {
                  rows.filter((r) => r.included && r.status === "unconfirmed")
                    .length
                }{" "}
                unconfirmed ·{" "}
                {rows.filter((r) => r.included && r.status === "missed").length}{" "}
                missed · {rows.filter((r) => !r.included).length} excluded
              </p>
              <small>
                Only explicitly confirmed sessions enter actual training.
                Missing effort stays unknown.
              </small>
            </div>
            <button
              className="button primary"
              disabled={busy || !rows.some((r) => r.included)}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save reviewed history"}
            </button>
          </div>
        </>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
export function HistoryReview({
  rows,
  setRows,
  date,
  dataset,
  defaultMode,
}: {
  rows: Candidate[];
  setRows: (r: Candidate[]) => void;
  date: string;
  dataset: Dataset;
  defaultMode: "quick" | "detailed";
}) {
  const first =
    rows.find((r) => r.included)?.date ?? rows[0]?.date ?? addDays(date, -1);
  const [selected, setSelected] = useState(first),
    [anchor, setAnchor] = useState(weekStart(first)),
    [from, setFrom] = useState(first),
    [to, setTo] = useState(rows.at(-1)?.date ?? first),
    [bulk, setBulk] = useState<"completed" | "missed" | "unconfirmed">(),
    [edit, setEdit] = useState<Candidate>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const days = dateRange(anchor, 7);
  const update = (id: string, patch: Partial<Candidate>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const range = rows.filter(
    (r) =>
      r.included &&
      (!selectedIds.length || selectedIds.includes(r.id)) &&
      !r.duplicateOf &&
      r.kind === "session" &&
      r.date >= from &&
      r.date <= to,
  );
  return (
    <section className="panel history-review">
      <SectionTitle
        title="Review the training you remember"
        detail="Calendar entries are proposals, not proof of attendance."
        action={
          <button
            className="button small"
            onClick={() => {
              const r = exceptionalRecord(dataset, selected);
              setRows([...rows, r]);
              setEdit(r);
            }}
          >
            <Plus size={15} />
            Exceptional session or tournament
          </button>
        }
      />
      <div className="review-totals">
        <span>{rows.length} proposed records</span>
        <span>
          {rows.filter((r) => r.duplicateOf).length} likely duplicates excluded
        </span>
        <span>
          {
            rows.filter(
              (r) =>
                r.included && r.estimatedFields.includes("durationMinutes"),
            ).length
          }{" "}
          estimated durations
        </span>
      </div>
      <div className="row spread review-calendar-toolbar">
        <button
          className="icon-button"
          aria-label="Previous review week"
          onClick={() => setAnchor(addDays(anchor, -7))}
        >
          <ChevronLeft size={18} />
        </button>
        <strong>
          {fmt(anchor)} – {fmt(addDays(anchor, 6))}
        </strong>
        <button
          className="icon-button"
          aria-label="Next review week"
          onClick={() => setAnchor(addDays(anchor, 7))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="history-calendar">
        {days.map((d) => {
          const events = rows.filter((r) => r.date === d && r.included);
          return (
            <button
              key={d}
              className={d === selected ? "selected" : ""}
              aria-label={`Review ${d}`}
              onClick={() => setSelected(d)}
            >
              <span>{fmt(d, { weekday: "short" })}</span>
              <strong>{fmt(d, { day: "numeric" })}</strong>
              {events.length ? (
                <>
                  <small>
                    {events.filter((r) => r.status === "unconfirmed").length}{" "}
                    uncertain
                  </small>
                  <small>
                    {events.filter((r) => r.status === "completed").length}{" "}
                    confirmed
                  </small>
                </>
              ) : (
                <small>No entries</small>
              )}
            </button>
          );
        })}
      </div>
      <div className="schedule-tools">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={
              !!rows.length &&
              selectedIds.length ===
                rows.filter((r) => r.included && !r.duplicateOf).length
            }
            onChange={(e) =>
              setSelectedIds(
                e.target.checked
                  ? rows
                      .filter((r) => r.included && !r.duplicateOf)
                      .map((r) => r.id)
                  : [],
              )
            }
          />{" "}
          Select all reviewed sessions
        </label>
        <span>
          {selectedIds.length} selected; range actions apply to this selection
          when present.
        </span>
        {!!selectedIds.length && (
          <>
            <button
              className="button small"
              onClick={() => {
                setRows(rows.filter((r) => !selectedIds.includes(r.id)));
                setSelectedIds([]);
              }}
            >
              Remove selected proposals
            </button>
            <select
              aria-label="Activity for selected history"
              value=""
              onChange={(e) => {
                setRows(
                  rows.map((r) =>
                    selectedIds.includes(r.id)
                      ? {
                          ...r,
                          category: e.target.value as Candidate["category"],
                        }
                      : r,
                  ),
                );
              }}
            >
              <option value="">Change activity…</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="review-bulk">
        <Field label="Review range from">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Review range through">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button
          className="button small"
          disabled={!range.length}
          onClick={() => setBulk("completed")}
        >
          Confirm range…
        </button>
        <button
          className="button small"
          disabled={!range.length}
          onClick={() => setBulk("missed")}
        >
          Mark range missed…
        </button>
        <button
          className="text-button"
          disabled={!range.length}
          onClick={() => setBulk("unconfirmed")}
        >
          Leave range uncertain…
        </button>
      </div>
      <h3 className="review-day-title">
        {fmt(selected, { weekday: "long", day: "numeric", month: "long" })}
      </h3>
      {rows.filter((r) => r.date === selected).length === 0 && (
        <p className="muted">
          No proposed entries on this day. Add an exception if you remember one.
        </p>
      )}
      {rows
        .filter((r) => r.date === selected)
        .map((r) => (
          <div
            key={r.id}
            className={`review-row ${!r.included ? "excluded" : ""}`}
          >
            <label className="checkbox">
              <input
                type="checkbox"
                aria-label={`Select historical ${r.title} ${r.date}`}
                checked={selectedIds.includes(r.id)}
                disabled={!!r.duplicateOf || !r.included}
                onChange={(e) =>
                  setSelectedIds(
                    e.target.checked
                      ? [...selectedIds, r.id]
                      : selectedIds.filter((id) => id !== r.id),
                  )
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={r.included}
                disabled={!!r.duplicateOf}
                onChange={(e) => update(r.id, { included: e.target.checked })}
              />
              <span className="visually-hidden">Include {r.title}</span>
            </label>
            <div className="review-row-title">
              <h3>{r.title}</h3>
              <p>
                {r.kind === "tournament" ? "Tournament" : r.category} ·{" "}
                {r.time || "Time not specified"}
              </p>
              <div className="row">
                <Badge>
                  {r.source === "weekly"
                    ? "Reconstructed"
                    : r.source === "manual"
                      ? "Added by you"
                      : "Imported"}
                </Badge>
                {r.estimatedFields.includes("durationMinutes") && (
                  <Badge>Estimated duration</Badge>
                )}
              </div>
              {r.duplicateOf && (
                <small>
                  Likely duplicate of an existing or earlier record. Excluded.
                </small>
              )}
              {r.warnings.map((w) => (
                <small key={w}>{w}</small>
              ))}
            </div>
            <Field label={`Duration for ${r.title} (min)`}>
              <input
                type="number"
                min={1}
                max={720}
                step="0.01"
                disabled={!r.included || r.kind === "tournament"}
                value={r.durationMinutes ?? ""}
                onChange={(e) =>
                  update(r.id, {
                    durationMinutes:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label={`Status for ${r.title}`}>
              <select
                value={r.status}
                disabled={!r.included}
                onChange={(e) =>
                  update(r.id, {
                    status: e.target.value as HistoricalRecord["status"],
                  })
                }
              >
                <option value="unconfirmed">Unconfirmed</option>
                <option value="completed">
                  {r.kind === "tournament" ? "Confirm event" : "Completed"}
                </option>
                <option value="missed">Missed</option>
              </select>
            </Field>
            <button className="text-button" onClick={() => setEdit(r)}>
              Edit details / effort
            </button>
          </div>
        ))}
      <details className="all-records">
        <summary>All proposed records, including unrelated events</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Review status</th>
                <th>Include</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(r.date);
                        setAnchor(weekStart(r.date));
                      }}
                    >
                      {r.date}
                    </button>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.duplicateOf ? "Likely duplicate" : r.status}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Include row ${r.id}`}
                      checked={r.included}
                      disabled={!!r.duplicateOf}
                      onChange={(e) =>
                        update(r.id, { included: e.target.checked })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {bulk && (
        <Modal
          title={
            bulk === "completed"
              ? "Confirm this range as completed?"
              : bulk === "missed"
                ? "Mark this range as missed?"
                : "Keep this range unconfirmed?"
          }
          description="Review this summary before changing the proposed records."
          onClose={() => setBulk(undefined)}
        >
          <p>
            {range.length} included sessions from {from} through {to} will be
            marked <strong>{bulk}</strong>.{" "}
            {
              range.filter((r) => r.estimatedFields.includes("durationMinutes"))
                .length
            }{" "}
            durations remain estimates. RPE values will stay unchanged.
          </p>
          {bulk === "completed" &&
            range.some((r) => r.durationMinutes === null) && (
              <p className="form-error">
                Sessions without duration will remain unconfirmed until you add
                meaningful exercise time.
              </p>
            )}
          <div className="form-actions">
            <button className="button" onClick={() => setBulk(undefined)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                const ids = new Set(range.map((r) => r.id));
                setRows(
                  rows.map((r) =>
                    ids.has(r.id)
                      ? {
                          ...r,
                          status:
                            bulk === "completed" && r.durationMinutes === null
                              ? "unconfirmed"
                              : bulk,
                        }
                      : r,
                  ),
                );
                setBulk(undefined);
              }}
            >
              Apply to proposed records
            </button>
          </div>
        </Modal>
      )}
      {edit && (
        <HistoricalEditor
          record={edit}
          defaultMode={defaultMode}
          onClose={() => setEdit(undefined)}
          onSave={(r) => {
            update(r.id, r);
            setSelected(r.date);
            setAnchor(weekStart(r.date));
            setEdit(undefined);
          }}
        />
      )}
    </section>
  );
}
function HistoricalEditor({
  record,
  defaultMode,
  onSave,
  onClose,
}: {
  record: Candidate;
  defaultMode: "quick" | "detailed";
  onSave: (r: Candidate) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [kind, setKind] = useState(record.kind),
    [rpe, setRpe] = useState(record.rpe),
    [mode, setMode] = useState(record.rpeInputMode ?? defaultMode),
    [estimated, setEstimated] = useState(
      record.estimatedFields.includes("durationMinutes"),
    );
  return (
    <Modal
      title="Review historical entry"
      description="Only record what you remember. RPE is optional."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next: Candidate = {
            ...record,
            kind,
            title: String(f.get("title")).trim(),
            date: String(f.get("date")),
            endDate:
              kind === "tournament"
                ? String(f.get("endDate"))
                : String(f.get("date")),
            category:
              kind === "tournament"
                ? "Competition"
                : (String(f.get("category")) as HistoricalRecord["category"]),
            priority: String(
              f.get("priority") ?? "C",
            ) as HistoricalRecord["priority"],
            time: String(f.get("time") ?? ""),
            durationMinutes:
              kind === "tournament"
                ? record.durationMinutes
                : f.get("duration") === ""
                  ? null
                  : Number(f.get("duration")),
            rpe: kind === "tournament" ? null : rpe,
            rpeInputMode: mode,
            estimatedFields: [
              ...record.estimatedFields.filter(
                (k) => k !== "durationMinutes" && k !== "time",
              ),
              ...(estimated ? ["durationMinutes" as const] : []),
              ...(!f.get("time") ? ["time" as const] : []),
            ],
            notes: String(f.get("notes")),
          };
          const validation = historySchema.safeParse(next);
          if (!validation.success) {
            setError(errorText(validation.error));
            return;
          }
          onSave(next);
        }}
      >
        <Field label="Entry type">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Candidate["kind"])}
          >
            <option value="session">Training session</option>
            <option value="tournament">Tournament / competition event</option>
          </select>
        </Field>
        <Field label="Historical entry name">
          <input
            name="title"
            defaultValue={record.title}
            required
            maxLength={150}
          />
        </Field>
        <div className="form-grid">
          <Field label="Historical date">
            <input
              type="date"
              name="date"
              defaultValue={record.date}
              required
            />
          </Field>
          {kind === "tournament" ? (
            <Field label="Tournament end date">
              <input
                type="date"
                name="endDate"
                defaultValue={record.endDate}
                required
              />
            </Field>
          ) : (
            <Field label="Historical time (optional)">
              <input type="time" name="time" defaultValue={record.time} />
            </Field>
          )}
        </div>
        {kind === "tournament" ? (
          <Field label="Tournament priority">
            <select name="priority" defaultValue={record.priority}>
              <option value="A">A — Main objective</option>
              <option value="B">B — Important</option>
              <option value="C">C — Development</option>
            </select>
          </Field>
        ) : (
          <>
            <div className="form-grid">
              <Field label="Historical category">
                <select name="category" defaultValue={record.category}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Historical duration (min)">
                <input
                  type="number"
                  name="duration"
                  min={1}
                  max={720}
                  step="0.01"
                  defaultValue={record.durationMinutes ?? ""}
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={estimated}
                onChange={(e) => setEstimated(e.target.checked)}
              />
              Duration is an athlete-confirmed estimate
            </label>
            <details className="details">
              <summary>Add remembered effort (optional)</summary>
              <RpeInput
                value={rpe}
                mode={mode}
                onChange={setRpe}
                onModeChange={setMode}
              />
            </details>
          </>
        )}
        <Field label="Historical notes">
          <textarea name="notes" defaultValue={record.notes} />
        </Field>
        <ErrorMessage error={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Save proposed entry</button>
        </div>
      </form>
    </Modal>
  );
}
