import {
  durationLabel,
  applyRoutineEdit,
  type RoutineEditRequest,
} from "../domain/routine";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Repeat2, Trash2 } from "lucide-react";
import { addDays, fmt, weekStart } from "../domain/dates";
import {
  detectPatterns,
  defaultPatternOptions,
  generateOccurrences,
  historyRange,
  parseSchedule,
  previewOccurrences,
  type PatternResult,
  type PlanPreview,
  type TextSchedule,
} from "../domain/schedule";
import {
  identity,
  type Data,
  type Dataset,
  type RecurringSchedule,
  type TrainingTemplate,
  type WeeklyRule,
} from "../domain/models";
import {
  detectDuplicates,
  sortCandidates,
  type Candidate,
} from "../domain/history";
import { planTraining } from "../domain/planner";
import { db } from "../db";
import {
  endSeries,
  saveSchedule,
  saveTemplate,
  undoSchedule,
  updateSeries,
  type SeriesScope,
} from "../schedule-storage";
import {
  exceptionalRecord,
  saveReviewedHistory,
  saveUsualWeek,
} from "../history-storage";
import { weekdayNames } from "../components/weekly-editor";
import { ActivityDaySelector } from "../components/activity-day-selector";
import { ErrorMessage, Field, SectionTitle, Badge } from "../components/ui";
import { errorText } from "../components/forms";
import { HistoryReview } from "./quick-start";
export type WorkspaceStart = "week" | "history" | "past";
type Stage = WorkspaceStart | "paste" | "templates" | "preview" | "review";
export function TrainingWorkspace({
  data,
  dataset,
  date,
  initialStage = "week",
  editRequest,
  onClose,
  onNotify,
}: {
  data: Data;
  dataset: Dataset;
  date: string;
  initialStage?: WorkspaceStart;
  editRequest?: RoutineEditRequest;
  onClose: () => void;
  onNotify: (s: string) => void;
}) {
  const initialSeries =
    editRequest?.scope === "future"
      ? data.recurrences.find((s) => s.id === editRequest.original.seriesId)
      : undefined;
  const initialRules = initialSeries?.rules ?? data.profile?.weeklyRules ?? [];
  const [stage, setStage] = useState<Stage>(initialStage);
  const [rules, setRules] = useState<WeeklyRule[]>(
    editRequest ? applyRoutineEdit(initialRules, editRequest) : initialRules,
  );
  const [rest, setRest] = useState<number[]>(
    initialSeries?.restDays ?? data.profile?.restDays ?? [],
  );
  const [unavailable, setUnavailable] = useState<number[]>(
    initialSeries?.unavailableDays ?? data.profile?.unavailableWeekdays ?? [],
  );
  const [name, setName] = useState(
    initialSeries?.name ?? "Normal training week",
  );
  const [source, setSource] = useState<TrainingTemplate["source"]>("typical");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [sourceRange, setSourceRange] = useState<{
    start: string;
    end: string;
  }>();
  const [templateId, setTemplateId] = useState<string>();
  const [from, setFrom] = useState(
      editRequest?.scope === "future" && editRequest.original.date >= date
        ? editRequest.original.date
        : date,
    ),
    [to, setTo] = useState(initialSeries?.endDate ?? addDays(date, 55));
  const [repeat, setRepeat] = useState(true),
    [indefinite, setIndefinite] = useState(initialSeries?.endDate === null);
  const [series, setSeries] = useState<RecurringSchedule | undefined>(
      initialSeries,
    ),
    [editScope, setEditScope] = useState<SeriesScope>("future");
  const [pastFrom, setPastFrom] = useState(addDays(date, -28)),
    [pastTo, setPastTo] = useState(addDays(date, -1));
  const [range, setRange] = useState(historyRange(date, 4)),
    [rangePreset, setRangePreset] = useState("4");
  const [heuristics, setHeuristics] = useState(defaultPatternOptions);
  const [detection, setDetection] = useState<PatternResult>();
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]),
    [selectedExceptions, setSelectedExceptions] = useState<string[]>([]);
  const [text, setText] = useState(""),
    [parsed, setParsed] = useState<TextSchedule>();
  const [pasteTarget, setPasteTarget] = useState<"future" | "past">("future");
  const [dated, setDated] = useState<TextSchedule["dated"]>([]);
  const [preview, setPreview] = useState<PlanPreview[]>([]),
    [pendingSeries, setPendingSeries] = useState<RecurringSchedule>();
  const [history, setHistory] = useState<Candidate[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [undoBatch, setUndoBatch] = useState<string>();
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  function show(next: Stage) {
    setStage(next);
    setError("");
  }
  function loadTemplate(t: TrainingTemplate) {
    setRules(t.rules);
    setRest(t.restDays);
    setUnavailable(t.unavailableDays);
    setName(t.name);
    setTemplateId(t.id);
    setSource(t.source);
    setSourceIds(t.sourceSessionIds);
    setSourceRange(
      t.sourceStart && t.sourceEnd
        ? { start: t.sourceStart, end: t.sourceEnd }
        : undefined,
    );
    setSeries(undefined);
    setDated([]);
    show("week");
  }
  function analyze() {
    const result = detectPatterns(data.sessions, range.start, range.end, {
      ...heuristics,
      copyWeek: rangePreset === "1",
    });
    setDetection(result);
    setSelectedPatterns(
      result.patterns.filter((p) => p.included).map((p) => p.rule.id),
    );
    setSelectedExceptions([]);
  }
  function useDetection() {
    if (!detection) return;
    const selected = detection.patterns.filter((p) =>
      selectedPatterns.includes(p.rule.id),
    );
    const exceptions = detection.excluded.filter((e) =>
      selectedExceptions.includes(e.session.id),
    );
    const extra = exceptions.map(({ session: s }) => ({
      id: crypto.randomUUID(),
      title: s.title,
      category: s.category,
      customActivity: s.customActivity,
      subtype: s.subtype,
      days: [new Date(s.date + "T12:00:00Z").getUTCDay()],
      durationMinutes: Math.round(s.durationMinutes),
      time: s.time,
      timeOfDay: s.timeOfDay,
    }));
    if (!selected.length && !extra.length)
      throw new Error("Choose sessions to include, or use your typical week.");
    setRules([...selected.map((p) => p.rule), ...extra]);
    setRest([]);
    setUnavailable([]);
    setDated([]);
    setSource("history");
    setSourceIds([
      ...selected.flatMap((p) => p.sourceIds),
      ...exceptions.map((e) => e.session.id),
    ]);
    setSourceRange({ start: detection.sourceStart, end: detection.sourceEnd });
    setTemplateId(undefined);
    setSeries(undefined);
    setName("Recent training pattern");
    show("week");
  }
  function buildPreview() {
    if (from < date)
      throw new Error(
        "Future plans must start today or later. Use Reconstruct Past Training for earlier dates.",
      );
    if (!rules.length)
      throw new Error("Add a session or choose a template first.");
    if (dated.length && !repeat && dated.length !== rules.length)
      throw new Error(
        "For a one-time dated schedule, use a date for every session. Remove weekday-only entries or choose a recurring week.",
      );
    const previewStart =
      series && editScope === "entire"
        ? series.startDate > date
          ? series.startDate
          : date
        : from;
    const end = indefinite ? addDays(from, 83) : to;
    const newSeries: RecurringSchedule | undefined = repeat
      ? {
          ...identity(dataset, series?.id),
          name,
          rules,
          restDays: rest,
          unavailableDays: unavailable,
          templateId,
          startDate: series?.startDate ?? from,
          endDate: indefinite ? null : end,
          generatedThrough: end,
          active: true,
        }
      : undefined;
    let plans = generateOccurrences({
      dataset,
      rules,
      restDays: rest,
      unavailableDays: unavailable,
      start: previewStart,
      end,
      seriesId: newSeries?.id,
    });
    if (dated.length && !repeat) {
      plans = dated
        .filter((d) => d.date >= from && d.date <= end)
        .flatMap((d) =>
          generateOccurrences({
            dataset,
            rules: [d.rule],
            restDays: [],
            unavailableDays: [],
            start: d.date,
            end: d.date,
          }),
        );
    }
    const batchId = crypto.randomUUID();
    plans = plans.map((p) => ({ ...p, planningBatchId: batchId }));
    const dataForPreview = series
      ? {
          ...data,
          plans: data.plans.filter(
            (p) =>
              p.seriesId !== series.id ||
              p.status !== "planned" ||
              p.locked ||
              p.occurrenceEdited ||
              p.date < previewStart,
          ),
        }
      : data;
    const exceptions = data.recurrenceExceptions.filter(
      (e) => e.seriesId === series?.id,
    );
    plans = plans.filter(
      (p) =>
        !exceptions.some(
          (e) => e.ruleId === p.templateRuleId && e.date === p.date,
        ),
    );
    setPreview(previewOccurrences(plans, dataForPreview));
    setPendingSeries(newSeries);
    show("preview");
  }
  function buildPast() {
    if (pastTo >= date || pastFrom > pastTo)
      throw new Error("Choose a historical range ending before today.");
    if (dated.length && dated.length !== rules.length)
      throw new Error(
        "Use dates for every one-time historical entry, or weekdays for a repeated historical week. Review the mixed entries first.",
      );
    const plans = dated.length
      ? dated
          .filter((d) => d.date >= pastFrom && d.date <= pastTo)
          .flatMap((d) =>
            generateOccurrences({
              dataset,
              rules: [d.rule],
              restDays: [],
              unavailableDays: [],
              start: d.date,
              end: d.date,
            }),
          )
      : generateOccurrences({
          dataset,
          rules,
          restDays: rest,
          unavailableDays: unavailable,
          start: pastFrom,
          end: pastTo,
        });
    const batchId = crypto.randomUUID();
    const rows: Candidate[] = plans.map((p) => ({
      ...exceptionalRecord(dataset, p.date),
      batchId,
      source: "weekly",
      sourceName:
        source === "text"
          ? "Pasted training schedule"
          : "Reviewed weekly reconstruction",
      sourceKey: `weekly:${p.templateRuleId}:${p.date}`,
      title: p.title,
      category: p.category,
      customActivity: p.customActivity,
      time: p.time,
      timeOfDay: p.timeOfDay,
      durationMinutes: p.duration,
      estimatedFields: [
        ...(p.duration === null ? [] : ["durationMinutes" as const]),
        ...(!p.time ? ["time" as const] : []),
      ],
      rpe: null,
    }));
    setHistory(sortCandidates(detectDuplicates(rows, data)));
    show("review");
  }
  const proposedData = useMemo(
    () => ({
      ...data,
      plans: [
        ...data.plans.filter(
          (p) =>
            !series ||
            p.seriesId !== series.id ||
            p.status !== "planned" ||
            p.locked ||
            p.occurrenceEdited ||
            p.date < (editScope === "entire" ? date : from),
        ),
        ...preview.filter((r) => r.included).map((r) => r.plan),
      ],
    }),
    [data, preview, series, editScope, date, from],
  );
  const guidance = useMemo(
    () => planTraining(proposedData, date),
    [proposedData, date],
  );
  const [rejected, setRejected] = useState<string[]>([]);
  return (
    <div className="training-workspace">
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={15} /> Back to calendar
      </button>
      <div className="workspace-heading">
        <div>
          <h2>Build your training week</h2>
          <p>A routine you can reuse. Every session stays independent.</p>
        </div>
        <Badge>Stored on this device</Badge>
      </div>
      <nav className="workspace-tabs" aria-label="Training editor tools">
        {(
          [
            ["week", "Plan Future Training"],
            ["past", "Reconstruct Past Training"],
            ["history", "Use My Training History to Plan Ahead"],
            ["templates", "Saved templates"],
            ["paste", "Paste Training Schedule"],
          ] as const
        ).map(([s, label]) => (
          <button
            key={s}
            className={stage === s ? "active" : ""}
            onClick={() => show(s)}
          >
            {label}
          </button>
        ))}
      </nav>
      {undoBatch && (
        <div className="inline-notice" role="status">
          Schedule saved. Completed and individually edited sessions are
          protected.
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await undoSchedule(undoBatch, dataset);
                setUndoBatch(undefined);
                onNotify("Unchanged planned sessions removed.");
              })
            }
          >
            Undo schedule
          </button>
        </div>
      )}
      <ErrorMessage error={error} />
      {stage === "history" && (
        <section className="panel pattern-panel">
          <SectionTitle
            title="Start with what you actually did"
            detail="Completed sessions only. The detected routine is a starting point, not a prescription."
          />
          <div className="schedule-tools">
            <Field label="Training history">
              <select
                value={rangePreset}
                onChange={(e) => {
                  setRangePreset(e.target.value);
                  setDetection(undefined);
                  if (e.target.value !== "custom")
                    setRange(historyRange(date, Number(e.target.value)));
                }}
              >
                <option value="1">Last completed week</option>
                <option value="2">Last 2 weeks</option>
                <option value="4">Last 4 weeks — recommended</option>
                <option value="6">Last 6 weeks</option>
                <option value="custom">Custom range</option>
              </select>
            </Field>
            <Field label="History from">
              <input
                type="date"
                value={range.start}
                max={addDays(date, -1)}
                onChange={(e) => {
                  setRange({ ...range, start: e.target.value });
                  setRangePreset("custom");
                  setDetection(undefined);
                }}
              />
            </Field>
            <Field label="History through">
              <input
                type="date"
                value={range.end}
                max={addDays(date, -1)}
                onChange={(e) => {
                  setRange({ ...range, end: e.target.value });
                  setRangePreset("custom");
                  setDetection(undefined);
                }}
              />
            </Field>
            <button
              className="button primary"
              onClick={() =>
                void run(() => {
                  if (range.end >= date)
                    throw new Error("Select completed historical dates.");
                  analyze();
                })
              }
            >
              Find my pattern
            </button>
          </div>
          <details className="pattern-options">
            <summary>How patterns are detected</summary>
            <p>
              Group by weekday, activity, time of day and independent session
              slot. A routine normally needs two observations in at least half
              the selected weeks. Durations use the median; competitions, camps
              and unusually long sessions are excluded for review.
            </p>
            <div className="schedule-tools">
              <Field label="Minimum observed weeks (%)">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={heuristics.minShare * 100}
                  onChange={(e) => {
                    setHeuristics({
                      ...heuristics,
                      minShare: Number(e.target.value) / 100,
                    });
                    setDetection(undefined);
                  }}
                />
              </Field>
              <Field label="Minimum occurrences">
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={heuristics.minOccurrences}
                  onChange={(e) => {
                    setHeuristics({
                      ...heuristics,
                      minOccurrences: Number(e.target.value),
                    });
                    setDetection(undefined);
                  }}
                />
              </Field>
              <Field label="Long-session threshold (× median)">
                <input
                  type="number"
                  min={1.1}
                  max={5}
                  step={0.1}
                  value={heuristics.outlierRatio}
                  onChange={(e) => {
                    setHeuristics({
                      ...heuristics,
                      outlierRatio: Number(e.target.value),
                    });
                    setDetection(undefined);
                  }}
                />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={heuristics.includeEstimates}
                  onChange={(e) => {
                    setHeuristics({
                      ...heuristics,
                      includeEstimates: e.target.checked,
                    });
                    setDetection(undefined);
                  }}
                />{" "}
                Consider athlete-confirmed duration estimates
              </label>
            </div>
          </details>
          {detection && (
            <>
              <div className="pattern-summary">
                <strong>
                  {detection.patterns.length} possible recurring session slots
                </strong>
                <p>
                  {detection.observedEmptyDays.length
                    ? `No completed training recorded on ${detection.observedEmptyDays.map((d) => weekdayNames[d]).join(", ")}. Missing logs do not prove these were rest days.`
                    : "Multiple training days recorded."}{" "}
                  Exact future times and RPE remain optional.
                </p>
              </div>
              {!detection.patterns.some((p) => p.included) && (
                <div className="inline-notice">
                  The history is sparse or inconsistent. Choose the sessions you
                  recognize below, or{" "}
                  <button
                    className="text-button"
                    onClick={() => {
                      setRules(data.profile?.weeklyRules ?? []);
                      show("week");
                    }}
                  >
                    use my typical-week template
                  </button>
                  .
                </div>
              )}
              {detection.patterns.map((p) => (
                <label className="pattern-row" key={p.rule.id}>
                  <input
                    type="checkbox"
                    checked={selectedPatterns.includes(p.rule.id)}
                    onChange={(e) =>
                      setSelectedPatterns(
                        e.target.checked
                          ? [...selectedPatterns, p.rule.id]
                          : selectedPatterns.filter((id) => id !== p.rule.id),
                      )
                    }
                  />
                  <div>
                    <strong>
                      {weekdayNames[p.rule.days[0]]} · {p.rule.timeOfDay} ·{" "}
                      {p.rule.category} · {p.rule.durationMinutes} min
                    </strong>
                    <p>{p.reason}</p>
                    <small>
                      {p.sourceIds.length} source session
                      {p.sourceIds.length === 1 ? "" : "s"}
                      {p.estimated
                        ? " · contains confirmed estimates"
                        : " · reported durations"}
                    </small>
                    <p className="helper">
                      Observed dates:{" "}
                      {p.sourceIds
                        .map(
                          (id) => data.sessions.find((s) => s.id === id)?.date,
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </label>
              ))}
              {!!detection.excluded.length && (
                <details className="pattern-exclusions">
                  <summary>
                    {detection.excluded.length} exceptional or estimated
                    sessions excluded — review
                  </summary>
                  {detection.excluded.map(({ session: s, reason }) => (
                    <label className="pattern-row" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selectedExceptions.includes(s.id)}
                        onChange={(e) =>
                          setSelectedExceptions(
                            e.target.checked
                              ? [...selectedExceptions, s.id]
                              : selectedExceptions.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <div>
                        <strong>
                          {s.date} · {s.title} · {s.durationMinutes} min
                        </strong>
                        <p>{reason}</p>
                        <small>
                          Select only if you want this activity repeated weekly.
                        </small>
                      </div>
                    </label>
                  ))}
                </details>
              )}
              <div className="form-actions">
                <button
                  className="button primary"
                  onClick={() => void run(useDetection)}
                >
                  Edit suggested week <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {stage === "paste" && (
        <section className="panel">
          <SectionTitle
            title="Paste a week, then review it"
            detail="Works offline. Use weekdays for a routine, or ISO dates for one-time entries."
          />
          <Field label="Training schedule">
            <textarea
              className="schedule-paste"
              rows={7}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(undefined);
              }}
              placeholder={
                "Mon: Gym 60m AM, Fencing 120m PM\nWed: Conditioning 30m AM, Fencing 90m PM\nSat: Footwork 45m, Sparring 120m"
              }
            />
          </Field>
          <div className="schedule-tools">
            <Field label="Use pasted training for">
              <select
                value={pasteTarget}
                onChange={(e) =>
                  setPasteTarget(e.target.value as typeof pasteTarget)
                }
              >
                <option value="future">Future planning</option>
                <option value="past">Historical reconstruction</option>
              </select>
            </Field>
            <button
              className="button"
              onClick={() => void run(() => setParsed(parseSchedule(text)))}
            >
              Preview pasted schedule
            </button>
          </div>
          {parsed && (
            <>
              <p>{parsed.rules.length} independent sessions recognized.</p>
              {parsed.warnings.map((w, i) => (
                <p className="form-error" key={i}>
                  {w}
                </p>
              ))}
              <ul className="paste-preview">
                {parsed.rules.map((r) => (
                  <li key={r.id}>
                    {parsed.dated.find((d) => d.rule.id === r.id)?.date ??
                      weekdayNames[r.days[0]]}{" "}
                    · {r.title} · {r.category} · {r.durationMinutes} min ·{" "}
                    {r.time || r.timeOfDay}
                  </li>
                ))}
              </ul>
              <button
                className="button primary"
                disabled={!parsed.rules.length}
                onClick={() => {
                  setRules(parsed.rules);
                  setDated(parsed.dated);
                  setRest([]);
                  setUnavailable([]);
                  setSource("text");
                  setTemplateId(undefined);
                  setSourceIds([]);
                  setSeries(undefined);
                  if (parsed.dated.length) {
                    const ds = parsed.dated.map((d) => d.date).sort();
                    if (pasteTarget === "future") {
                      setFrom(ds[0]);
                      setTo(ds.at(-1)!);
                      setRepeat(false);
                    } else {
                      setPastFrom(ds[0]);
                      setPastTo(ds.at(-1)!);
                    }
                  }
                  show(pasteTarget === "past" ? "past" : "week");
                }}
              >
                Edit parsed week
              </button>
            </>
          )}
        </section>
      )}
      {stage === "templates" && (
        <section className="panel">
          <SectionTitle
            title="Weeks ready to reuse"
            detail="Load a template, edit it, then preview a date range before adding anything."
          />
          {!data.templates.length && (
            <p>
              No saved templates yet. Build a week or find your historical
              pattern, then save it here.
            </p>
          )}
          {data.templates.map((t) => (
            <div className="template-row" key={t.id}>
              <div>
                <input
                  aria-label={`Template name ${t.name}`}
                  defaultValue={t.name}
                  maxLength={100}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== t.name)
                      void run(() => saveTemplate({ ...t, name }));
                  }}
                />
                <small>
                  {t.rules.reduce((n, r) => n + r.days.length, 0)} sessions ·{" "}
                  {t.source === "history"
                    ? `from completed training ${t.sourceStart}–${t.sourceEnd}`
                    : t.source}
                </small>
              </div>
              <button className="button small" onClick={() => loadTemplate(t)}>
                Use / edit template
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate template ${t.name}`}
                onClick={() =>
                  void run(() =>
                    saveTemplate({
                      ...t,
                      ...identity(dataset),
                      name: t.name + " copy",
                    }),
                  )
                }
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete template ${t.name}`}
                onClick={() =>
                  void run(async () => {
                    await db.templates.delete(t.id);
                    if (templateId === t.id) setTemplateId(undefined);
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="schedule-tools">
            {[
              "Competition week",
              "Recovery week",
              "High-volume week",
              "Strength-focused week",
            ].map((n) => (
              <button
                className="button small"
                key={n}
                onClick={() => {
                  setName(n);
                  setRules([]);
                  setRest([]);
                  setUnavailable([]);
                  setTemplateId(undefined);
                  setSource("custom");
                  setSourceIds([]);
                  setSeries(undefined);
                  show("week");
                }}
              >
                Create {n.toLowerCase()}
              </button>
            ))}
          </div>
          <p className="helper">
            Named weeks start empty so you choose the activities and volume.
          </p>
        </section>
      )}
      {(stage === "week" || stage === "past") && (
        <>
          <section className="panel workspace-week">
            <SectionTitle
              title={
                stage === "past"
                  ? "Reconstruct Past Training"
                  : "Your reusable week"
              }
              detail={
                source === "history"
                  ? "Based on your chosen completed sessions. All future durations are planning estimates; no RPE is inferred."
                  : "Select activities and training days, then review the dates before applying."
              }
            />
            <ActivityDaySelector
              context={stage === "past" ? "history" : "future"}
              onUseUsual={() => {
                setRules(data.profile?.weeklyRules ?? []);
                setRest(data.profile?.restDays ?? []);
                setUnavailable(data.profile?.unavailableWeekdays ?? []);
                setSeries(undefined);
                setDated([]);
                setSource("typical");
                setSourceIds([]);
                setSourceRange(undefined);
                setTemplateId(undefined);
              }}
              rules={rules}
              restDays={rest}
              unavailableDays={unavailable}
              onChange={(r, a, u) => {
                setRules(r);
                setRest(a);
                setUnavailable(u);
                setDated(
                  dated
                    .filter((d) => r.some((x) => x.id === d.rule.id))
                    .map((d) => ({
                      ...d,
                      rule: r.find((x) => x.id === d.rule.id)!,
                      date: addDays(
                        weekStart(d.date),
                        (r.find((x) => x.id === d.rule.id)!.days[0] + 6) % 7,
                      ),
                    })),
                );
              }}
              onUseRecent={() => show("history")}
            />
            <div className="selector-routine-save">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await saveUsualWeek(dataset, rules, rest, unavailable);
                    onNotify(
                      "Usual training week updated. Existing training and future plans are unchanged.",
                    );
                  })
                }
              >
                Update my usual training week
              </button>
              <p className="helper">
                Save this routine for reuse without changing individual
                sessions.
              </p>
            </div>
            <div className="template-save">
              <Field label="Week / template name">
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <button
                className="button"
                disabled={busy || !rules.length}
                onClick={() =>
                  void run(async () => {
                    const t: TrainingTemplate = {
                      ...identity(dataset, templateId),
                      name,
                      rules,
                      restDays: rest,
                      unavailableDays: unavailable,
                      source,
                      sourceSessionIds: sourceIds,
                      sourceStart: sourceRange?.start,
                      sourceEnd: sourceRange?.end,
                    };
                    await saveTemplate(t);
                    setTemplateId(t.id);
                    onNotify("Weekly template saved for reuse.");
                  })
                }
              >
                Save reusable template
              </button>
            </div>
          </section>
          {stage === "past" ? (
            <section className="panel">
              <SectionTitle
                title="Propose recent sessions"
                detail="Every occurrence starts unconfirmed. Confirm only the sessions you remember completing."
              />
              <div className="schedule-tools">
                {[2, 4, 6].map((w) => (
                  <button
                    className="button small"
                    key={w}
                    onClick={() => {
                      setPastFrom(addDays(date, -w * 7));
                      setPastTo(addDays(date, -1));
                    }}
                  >
                    Previous {w} weeks
                  </button>
                ))}
                <Field label="Reconstruct from">
                  <input
                    type="date"
                    max={addDays(date, -1)}
                    value={pastFrom}
                    onChange={(e) => setPastFrom(e.target.value)}
                  />
                </Field>
                <Field label="Reconstruct through">
                  <input
                    type="date"
                    max={addDays(date, -1)}
                    value={pastTo}
                    onChange={(e) => setPastTo(e.target.value)}
                  />
                </Field>
                <button
                  className="button primary"
                  disabled={busy || !rules.length}
                  onClick={() => void run(buildPast)}
                >
                  Review proposed history
                </button>
              </div>
            </section>
          ) : (
            <section className="panel">
              <SectionTitle
                title={
                  series ? "Update recurring training" : "Apply to future dates"
                }
                detail="Existing plans and completed training are preserved. Review duplicates and competition conflicts first."
              />
              <div className="schedule-tools">
                {[2, 4, 8, 12].map((w) => (
                  <button
                    className="button small"
                    key={w}
                    onClick={() => {
                      setTo(addDays(from, w * 7 - 1));
                      setIndefinite(false);
                    }}
                  >
                    Next {w} weeks
                  </button>
                ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setTo(addDays(from, 6));
                    setRepeat(false);
                    setIndefinite(false);
                  }}
                >
                  Copy week once
                </button>
              </div>
              <div className="schedule-tools">
                <Field label="Plan from">
                  <input
                    type="date"
                    min={date}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
                <Field label="Plan through">
                  <input
                    type="date"
                    min={from}
                    disabled={indefinite}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={repeat}
                    disabled={!!series}
                    onChange={(e) => {
                      setRepeat(e.target.checked);
                      if (!e.target.checked) setIndefinite(false);
                    }}
                  />{" "}
                  Create a recurring series
                </label>
                {repeat && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={indefinite}
                      onChange={(e) => setIndefinite(e.target.checked)}
                    />{" "}
                    Continue indefinitely
                  </label>
                )}
                {series && (
                  <Field label="Edit recurrence scope">
                    <select
                      value={editScope}
                      onChange={(e) =>
                        setEditScope(e.target.value as SeriesScope)
                      }
                    >
                      <option value="future">
                        This date and future occurrences
                      </option>
                      <option value="entire">
                        Entire series — protect completed history
                      </option>
                    </select>
                  </Field>
                )}
                <button
                  className="button primary"
                  disabled={busy || !rules.length}
                  onClick={() => void run(buildPreview)}
                >
                  Preview future calendar <ArrowRight size={16} />
                </button>
              </div>
              {indefinite && (
                <p className="helper">
                  Stored as an ongoing schedule. The next 12 weeks are generated
                  locally and extended when you open the app.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {stage === "preview" && (
        <>
          <section className="panel">
            <SectionTitle
              title="Review your future calendar"
              detail={`${preview.filter((r) => r.included).length} new sessions selected · ${preview.filter((r) => r.duplicateOf).length} potential duplicates excluded · ${preview.filter((r) => r.conflicts.length).length} sessions need review`}
            />
            <div className="preview-legend">
              <span>New sessions</span>
              <span>Existing sessions retained</span>
              <span>Conflicts need review</span>
            </div>
            <div className="schedule-preview-calendar">
              {Array.from(new Set(preview.map((r) => r.plan.date))).map((d) => (
                <section key={d}>
                  <h3>
                    {fmt(d, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </h3>
                  {data.plans
                    .filter((p) => p.date === d)
                    .map((p) => (
                      <p className="existing-occurrence" key={p.id}>
                        Existing · {p.title} · {durationLabel(p.duration)} ·{" "}
                        {p.status}
                        {p.occurrenceEdited ? " · individually edited" : ""}
                      </p>
                    ))}
                  {data.sessions
                    .filter((s) => s.date === d)
                    .map((s) => (
                      <p className="existing-occurrence" key={s.id}>
                        Completed · {s.title} · {s.durationMinutes}m
                      </p>
                    ))}
                  {preview
                    .filter((r) => r.plan.date === d)
                    .map((r) => (
                      <label
                        className={`proposed-occurrence ${r.conflicts.length ? "has-conflict" : ""}`}
                        key={r.plan.id}
                      >
                        <input
                          type="checkbox"
                          disabled={!!r.duplicateOf}
                          checked={r.included}
                          onChange={(e) =>
                            setPreview(
                              preview.map((p) =>
                                p.plan.id === r.plan.id
                                  ? { ...p, included: e.target.checked }
                                  : p,
                              ),
                            )
                          }
                        />
                        <div>
                          <strong>{r.plan.title}</strong>
                          <span>
                            {durationLabel(r.plan.duration)} ·{" "}
                            {r.plan.time || r.plan.timeOfDay || "Any time"}
                          </span>
                          {r.duplicateOf && (
                            <small>Potential duplicate — excluded</small>
                          )}
                          {r.conflicts.map((c) => (
                            <small key={c}>{c}</small>
                          ))}
                        </div>
                      </label>
                    ))}
                </section>
              ))}
            </div>
            {!preview.length && (
              <p>
                No new occurrences in this range. Check dates, rest days and
                excluded occurrences.
              </p>
            )}
          </section>
          <section className="panel">
            <SectionTitle
              title="Competition-aware review"
              detail={`${guidance.phase}${guidance.provisional ? " · Provisional" : ""}. Suggestions use the existing planner and never change your calendar automatically.`}
            />
            <p>{guidance.reason}</p>
            {guidance.suggestions
              .filter((s) => !rejected.includes(s.key))
              .slice(0, 8)
              .map((s) => (
                <div className="planning-review" key={s.key}>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                  <div className="schedule-tools">
                    {s.planId &&
                      (s.newDuration !== undefined || s.newDate) &&
                      preview.some((r) => r.plan.id === s.planId) && (
                        <button
                          className="button small"
                          onClick={() =>
                            setPreview(
                              preview.map((r) =>
                                r.plan.id === s.planId
                                  ? {
                                      ...r,
                                      plan: {
                                        ...r.plan,
                                        duration:
                                          s.newDuration ?? r.plan.duration,
                                        date: s.newDate ?? r.plan.date,
                                        occurrenceEdited: true,
                                      },
                                    }
                                  : r,
                              ),
                            )
                          }
                        >
                          Accept suggestion in preview
                        </button>
                      )}
                    <button
                      className="text-button"
                      onClick={() => setRejected([...rejected, s.key])}
                    >
                      Keep my plan
                    </button>
                  </div>
                </div>
              ))}
            <p className="helper">
              You can edit the week before saving and adjust individual
              occurrences afterward. Historical routines describe what you did,
              not what is necessarily optimal.
            </p>
          </section>
          <div className="history-save-bar">
            <button className="button" onClick={() => show("week")}>
              Edit week / dates
            </button>
            <button
              className="button primary"
              disabled={busy || !preview.some((r) => r.included)}
              onClick={() =>
                void run(async () => {
                  if (series && pendingSeries) {
                    await updateSeries(
                      pendingSeries,
                      editScope === "entire" ? date : from,
                      editScope,
                      date,
                      preview,
                    );
                    onNotify(
                      "Recurring schedule updated; completed and individual edits retained.",
                    );
                  } else {
                    const result = await saveSchedule(preview, pendingSeries);
                    setUndoBatch(result.batchId);
                    onNotify(
                      `${result.saved} planned sessions added. ${result.duplicates} duplicates skipped.`,
                    );
                  }
                  setSeries(undefined);
                  show("week");
                })
              }
            >
              {busy
                ? "Saving…"
                : series
                  ? "Save recurring changes"
                  : "Save future schedule"}
            </button>
          </div>
        </>
      )}
      {stage === "review" && (
        <>
          <HistoryReview
            rows={history}
            setRows={setHistory}
            date={date}
            dataset={dataset}
            defaultMode={data.profile?.defaultRpeMode ?? "quick"}
          />
          <div className="history-save-bar">
            <button className="button" onClick={() => show("past")}>
              Edit source week
            </button>
            <p>
              {
                history.filter((r) => r.included && r.status === "completed")
                  .length
              }{" "}
              completed ·{" "}
              {
                history.filter((r) => r.included && r.status === "unconfirmed")
                  .length
              }{" "}
              unconfirmed
            </p>
            <button
              className="button primary"
              disabled={busy || !history.some((r) => r.included)}
              onClick={() =>
                void run(async () => {
                  const saved = await saveReviewedHistory(
                    history,
                    dataset,
                    date,
                  );
                  onNotify(
                    `${saved.completed} completed sessions added; other entries remain separate.`,
                  );
                  show("past");
                })
              }
            >
              Save reviewed history
            </button>
          </div>
        </>
      )}
      {!!data.recurrences.length && stage === "week" && (
        <section className="panel">
          <SectionTitle
            title="Recurring schedules"
            detail="Editing protects completed, locked and individually edited occurrences."
          />
          {data.recurrences.map((s) => (
            <div className="template-row" key={s.id}>
              <Repeat2 size={18} />
              <div className="flex-one">
                <h3>{s.name}</h3>
                <p>
                  {s.startDate} – {s.endDate ?? "ongoing"} ·{" "}
                  {s.active ? "Active" : "Ended"}
                </p>
              </div>
              {s.active && (
                <>
                  <button
                    className="button small"
                    onClick={() => {
                      setSeries(s);
                      setRules(s.rules);
                      setRest(s.restDays);
                      setUnavailable(s.unavailableDays);
                      setName(s.name);
                      setFrom(date > s.startDate ? date : s.startDate);
                      setTo(s.endDate ?? addDays(date, 83));
                      setIndefinite(s.endDate === null);
                      setRepeat(true);
                      setDated([]);
                      setTemplateId(s.templateId);
                      show("week");
                    }}
                  >
                    Edit recurring series
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await endSeries(s.id, date, date);
                        onNotify(
                          "Recurring schedule ended; protected training retained.",
                        );
                      })
                    }
                  >
                    End recurring schedule
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
