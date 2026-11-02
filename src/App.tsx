import type { RoutineEditRequest } from "./domain/routine";
import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  House,
  Laptop,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings2,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  db,
  applySuggestion,
  clearSample,
  deleteSession,
  deleteTournament,
  replaceData,
  undoDecision,
  useData,
} from "./db";
import { addDays, fmt, today } from "./domain/dates";
import {
  identity,
  phases,
  type CheckIn,
  type Data,
  type Dataset,
  type Phase,
  type Plan,
  type Session,
  type Tournament,
} from "./domain/models";
import { planTraining, PLANNER_VERSION } from "./domain/planner";
import { sampleData } from "./domain/sample";
import {
  CheckInForm,
  errorText,
  PlanForm,
  SessionForm,
  TournamentForm,
} from "./components/forms";
import { Confirm, ErrorMessage, Field, Modal } from "./components/ui";
import { TodayPage } from "./pages/today";
import { CalendarPage } from "./pages/calendar";
import { TrainingPage } from "./pages/training";
import { InsightsPage } from "./pages/insights";
import { SetupWizard } from "./components/setup-wizard";
import {
  QuickStartPage,
  HistoryChoices,
  type HistoryStage,
} from "./pages/quick-start";
import { StartingPlan } from "./components/starting-plan";
import { skipHistory } from "./history-storage";
import { SettingsPage } from "./pages/settings";
import {
  TrainingWorkspace,
  type WorkspaceStart,
} from "./pages/training-workspace";
import { extendRecurringSchedules, skipOccurrence } from "./schedule-storage";
type Page =
  | "Today"
  | "Calendar"
  | "Log Training"
  | "Insights"
  | "Settings"
  | "Quick Start"
  | "Training Editor";
// The weekly editor is reached from Calendar, Insights and Today without adding navigation clutter.
const navigation = [
  { label: "Today", icon: House },
  { label: "Calendar", icon: CalendarDays },
  { label: "Log Training", icon: ClipboardList },
  { label: "Insights", icon: ChartNoAxesCombined },
  { label: "Settings", icon: Settings2 },
] as const;
type Dialog =
  | { type: "session"; initial?: Session; plan?: Plan }
  | { type: "tournament"; initial?: Tournament; date?: string }
  | { type: "plan"; initial?: Plan; date?: string }
  | { type: "checkIn"; initial?: CheckIn }
  | { type: "override" }
  | { type: "help" };
export default function App() {
  const [dataset, setDataset] = useState<Dataset>(() =>
    localStorage.getItem("athleteos-dataset") === "sample"
      ? "sample"
      : "personal",
  );
  const data = useData(dataset);
  const [workspaceRequest, setWorkspaceRequest] =
    useState<RoutineEditRequest>();
  const [workspaceStart, setWorkspaceStart] = useState<WorkspaceStart>("week");
  const [historyInviteDismissed, setHistoryInviteDismissed] = useState(
    () => localStorage.getItem("athleteos-history-invite") === "dismissed",
  );
  const [historyStage, setHistoryStage] = useState<HistoryStage>("choice");
  const [calendarFocus, setCalendarFocus] = useState<string>();
  const [page, setPage] = useState<Page>("Today"),
    [dialog, setDialog] = useState<Dialog>(),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [, setBusy] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [confirm, setConfirm] = useState<{
      title: string;
      description: string;
      fn: () => Promise<void>;
    }>();
  const date = today(data?.profile?.timezone ?? "Asia/Singapore");
  const notify = (m: string) => setToast(m);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    localStorage.setItem("athleteos-dataset", dataset);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [dataset, data?.profile?.id]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const preference = data?.profile?.theme ?? "light";
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.theme =
        preference === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preference);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [data?.profile?.theme]);
  useEffect(() => {
    if (data?.profile)
      void extendRecurringSchedules(dataset, date).catch((e) =>
        setError(errorText(e)),
      );
  }, [data?.profile?.id, dataset, date]);
  async function run(fn: () => Promise<unknown>, message?: string) {
    setError("");
    try {
      await fn();
      if (message) notify(message);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function demo() {
    if (dataset === "sample") {
      setDataset("personal");
      return;
    }
    setBusy(true);
    await run(async () => {
      const p = await db.profiles.get("sample");
      if (!p) await replaceData(sampleData(date), "sample");
      setDataset("sample");
      setPage("Today");
    });
    setBusy(false);
  }
  function deletePrompt(
    title: string,
    description: string,
    fn: () => Promise<void>,
  ) {
    setConfirm({ title, description, fn });
  }
  function deleteCompleted(s: Session) {
    deletePrompt("Delete completed session?", s.title, () => deleteSession(s));
  }
  const navigate = (p: Page) => {
    setPage(p);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const close = () => setDialog(undefined);
  if (!data)
    return (
      <div className="loading-screen">
        <Activity size={30} />
        <p>Opening your training workspace…</p>
      </div>
    );
  if (!data.profile)
    return (
      <SetupWizard
        dataset={dataset}
        onDemo={() => void demo()}
        onDone={() => setPage("Today")}
        onImport={() => {
          setHistoryStage("import");
          setPage("Quick Start");
        }}
      />
    );
  function openHistory(stage: HistoryStage = "choice") {
    setHistoryStage(stage);
    navigate("Quick Start");
  }
  const openWorkspace = (start: WorkspaceStart = "week") => {
    setWorkspaceRequest(undefined);
    setWorkspaceStart(start);
    navigate("Training Editor");
  };
  const planning = planTraining(data, date);
  const checkIn = data.checkIns.find((c) => c.date === date);
  const log = (plan?: Plan) => setDialog({ type: "session", plan });
  const check = (c?: CheckIn) =>
    setDialog({ type: "checkIn", initial: c ?? checkIn });
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileMenu(false)}
          >
            <X size={21} />
          </button>
        </div>
        <div className="workspace-label">Your training workspace</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={
                page === label ||
                (page === "Training Editor" && label === "Calendar")
                  ? "active"
                  : ""
              }
              aria-current={
                page === label ||
                (page === "Training Editor" && label === "Calendar")
                  ? "page"
                  : undefined
              }
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === page && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Private by design</strong>
              <p>Saved on this device</p>
            </div>
          </div>
          <button
            className="sidebar-help"
            onClick={() => setDialog({ type: "help" })}
          >
            <CircleHelp size={17} />
            How AthleteOS works
          </button>
          <button
            className="athlete-switch"
            onClick={() => navigate("Settings")}
          >
            <span className="avatar">
              {data.profile.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{data.profile.name}</strong>
              <small>{data.profile.sport} athlete</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              My workspace <span>/</span> <strong>{page}</strong>
            </span>
          </div>
          <div className="row">
            <span className="saved-status">
              <span className="status-dot" />
              {offline ? "Working offline" : "Local workspace"}
            </span>
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() =>
                void run(() =>
                  db.profiles.put({
                    ...data.profile!,
                    theme:
                      document.documentElement.dataset.theme === "dark"
                        ? "light"
                        : "dark",
                  }),
                )
              }
            >
              {document.documentElement.dataset.theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          </div>
        </header>
        {dataset === "sample" && (
          <div className="sample-banner">
            <span>
              <Laptop size={16} />
              Sample athlete · Fictional training data
            </span>
            <button onClick={() => setDataset("personal")}>
              Return to my data <LogOut size={14} />
            </button>
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="page-date">
                {fmt(date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <h1>
                {page === "Today"
                  ? `Your day, ${data.profile.name.split(" ")[0]}.`
                  : page === "Training Editor"
                    ? "Your training week."
                    : page === "Log Training"
                      ? "Log training"
                      : page === "Quick Start"
                        ? "Your training, with a little context."
                        : page === "Settings"
                          ? "Your workspace"
                          : page === "Calendar"
                            ? "A plan with perspective."
                            : "Understand your rhythm."}
              </h1>
              <p>
                {page === "Today"
                  ? "Train with purpose. Leave room to adapt."
                  : page === "Training Editor"
                    ? "Reuse your routine. Review every change."
                    : page === "Calendar"
                      ? "Your training and competitions, together."
                      : page === "Log Training"
                        ? "Record the work. Keep the useful details."
                        : page === "Insights"
                          ? "See what your training and recovery are telling you."
                          : "Preferences, planning rules, and the data you own."}
              </p>
            </div>
            <div className="page-actions">
              {page === "Today" && (
                <button
                  className={`button ${!checkIn && data.profile.checkInReminder ? "check-in-prompt" : ""}`}
                  onClick={() => check()}
                >
                  {checkIn ? <Check size={16} /> : <Leaf size={16} />}Check in
                </button>
              )}
              {page === "Calendar" ? (
                <>
                  <button
                    className="button"
                    onClick={() => setDialog({ type: "tournament" })}
                  >
                    <Plus size={16} />
                    Tournament
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setDialog({ type: "plan" })}
                  >
                    <Plus size={17} />
                    Plan session
                  </button>
                </>
              ) : page !== "Settings" && page !== "Log Training" ? (
                <button className="button primary" onClick={() => log()}>
                  <Plus size={17} />
                  Log session
                </button>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="app-error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Training Editor" && (
            <TrainingWorkspace
              key={
                dataset +
                workspaceStart +
                (workspaceRequest?.changed.updatedAt ?? "")
              }
              data={data}
              dataset={dataset}
              date={date}
              initialStage={workspaceStart}
              editRequest={workspaceRequest}
              onClose={() => navigate("Calendar")}
              onNotify={notify}
            />
          )}
          {page === "Today" &&
            !historyInviteDismissed &&
            data.sessions.filter((s) => s.date >= addDays(date, -28)).length >=
              8 && (
              <div className="inline-notice">
                Use recent completed training as a starting point for your next
                month.
                <button
                  className="text-button"
                  onClick={() => {
                    localStorage.setItem(
                      "athleteos-history-invite",
                      "dismissed",
                    );
                    setHistoryInviteDismissed(true);
                    openWorkspace("history");
                  }}
                >
                  Use My Training History to Plan Ahead
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    localStorage.setItem(
                      "athleteos-history-invite",
                      "dismissed",
                    );
                    setHistoryInviteDismissed(true);
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          {page === "Quick Start" && (
            <QuickStartPage
              key={historyStage + dataset}
              data={data}
              dataset={dataset}
              date={date}
              initialStage={historyStage}
              onDone={() => navigate("Today")}
              onNotify={notify}
            />
          )}
          {page === "Today" && (
            <StartingPlan
              data={data}
              date={date}
              planning={planning}
              onDate={(d) => {
                setCalendarFocus(d);
                navigate("Calendar");
              }}
              onHistory={() =>
                openHistory(
                  data.history.some((h) => h.status === "unconfirmed")
                    ? "review"
                    : "choice",
                )
              }
              onWeek={() => openHistory("template")}
            />
          )}
          {page === "Today" && (
            <TodayPage
              data={data}
              date={date}
              planning={planning}
              onLog={log}
              onCheckIn={() => check()}
              onPlan={() => setDialog({ type: "plan" })}
              onCalendar={() => navigate("Calendar")}
              onInsights={() => navigate("Insights")}
              onOverride={() => setDialog({ type: "override" })}
              onApply={(s) =>
                void run(
                  () => applySuggestion(s, dataset, date),
                  "Adjustment applied. You can undo it in Settings.",
                )
              }
              onDismiss={(s) =>
                void run(
                  () =>
                    db.decisions.put({
                      ...identity(dataset),
                      key: s.key,
                      status: "dismissed",
                      algorithm: PLANNER_VERSION,
                      rationale: s.text,
                      inputIds: s.inputIds,
                    }),
                  "Suggestion dismissed.",
                )
              }
            />
          )}
          {page === "Today" && data.profile.quickStartStatus === "pending" && (
            <HistoryChoices
              onChoose={openHistory}
              onSkip={() =>
                void run(
                  () => skipHistory(dataset),
                  "Your provisional plan is ready. Log actual training as you go.",
                )
              }
            />
          )}
          {page === "Calendar" && (
            <CalendarPage
              data={data}
              date={date}
              initialDate={calendarFocus}
              onWorkspace={openWorkspace}
              onSkipOccurrence={(p) =>
                void run(
                  () => skipOccurrence(p),
                  "Occurrence skipped; other sessions retained.",
                )
              }
              onPlan={(d, initial) =>
                setDialog({ type: "plan", date: d, initial })
              }
              onTournament={(d, initial) =>
                setDialog({ type: "tournament", date: d, initial })
              }
              onLog={log}
              onEditSession={(s) => setDialog({ type: "session", initial: s })}
              onDeletePlan={(p) =>
                deletePrompt("Delete planned session?", p.title, () =>
                  skipOccurrence(p),
                )
              }
              onDeleteSession={deleteCompleted}
              onDeleteTournament={(t) =>
                deletePrompt("Delete tournament?", t.name, () =>
                  deleteTournament(t.id),
                )
              }
            />
          )}
          {page === "Log Training" && (
            <TrainingPage
              data={data}
              onLog={() => log()}
              onEdit={(s) => setDialog({ type: "session", initial: s })}
              onDelete={deleteCompleted}
            />
          )}
          {page === "Insights" && (
            <InsightsPage
              data={data}
              date={date}
              onHistoryPlan={() => openWorkspace("history")}
              onCheckIn={(c) => check(c)}
              onDeleteCheckIn={(c) =>
                deletePrompt("Delete recovery check-in?", fmt(c.date), () =>
                  db.checkIns.delete(c.id),
                )
              }
              onDeletePain={(p) =>
                deletePrompt("Delete symptom observation?", p.location, () =>
                  db.pain.delete(p.id),
                )
              }
            />
          )}
          {page === "Settings" && (
            <SettingsPage
              data={data}
              dataset={dataset}
              date={date}
              onNotify={notify}
              onHistory={() => openHistory()}
              onTypicalWeek={() => openHistory("template")}
              onDemo={() => void demo()}
              onClearSample={() =>
                deletePrompt(
                  "Clear sample records?",
                  "Only the isolated sample athlete will be removed. Your personal data is preserved.",
                  async () => {
                    await clearSample();
                    if (dataset === "sample") setDataset("personal");
                  },
                )
              }
              onUndo={(id) =>
                void run(
                  () => undoDecision(data.decisions.find((d) => d.id === id)!),
                  "Original plan restored.",
                )
              }
              onRestoreSuggestions={() =>
                void run(
                  () =>
                    db.decisions
                      .where("dataset")
                      .equals(dataset)
                      .filter((d) => d.status === "dismissed")
                      .delete(),
                  "Dismissed suggestions restored.",
                )
              }
            />
          )}
          <footer className="app-footer">
            <span>
              AthleteOS <span className="footer-separator">/</span> Your
              training, in perspective.
            </span>
            <span>
              <ShieldCheck size={12} />
              On-device. Always yours.
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={
              page === label ||
              (page === "Training Editor" && label === "Calendar")
                ? "active"
                : ""
            }
            aria-label={label}
            onClick={() => navigate(label)}
          >
            <Icon size={19} />
            <span>{label === "Log Training" ? "Training" : label}</span>
          </button>
        ))}
      </nav>
      {dialog?.type === "session" && (
        <SessionForm
          dataset={dataset}
          date={date}
          data={data}
          initial={dialog.initial}
          plan={dialog.plan}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.type === "plan" && (
        <PlanForm
          athleteDate={date}
          dataset={dataset}
          date={dialog.date ?? date}
          initial={dialog.initial}
          onEditRoutine={(request) => {
            setWorkspaceRequest(request);
            setWorkspaceStart("week");
            navigate("Training Editor");
          }}
          onClose={close}
        />
      )}
      {dialog?.type === "tournament" && (
        <TournamentForm
          dataset={dataset}
          date={dialog.date ?? date}
          initial={dialog.initial}
          onClose={close}
        />
      )}
      {dialog?.type === "checkIn" && (
        <CheckInForm
          dataset={dataset}
          date={dialog.initial?.date ?? date}
          initial={dialog.initial}
          data={data}
          onClose={close}
        />
      )}
      {dialog?.type === "override" && (
        <OverrideForm
          data={data}
          dataset={dataset}
          date={date}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.type === "help" && (
        <Modal
          title="A plan you can understand"
          onClose={() => setDialog(undefined)}
        >
          <div className="help-content">
            <p>
              <strong>Start with the work.</strong> Log meaningful exercise
              minutes and the effort of your entire session. Skipping effort
              leaves workload unknown.
            </p>
            <p>
              <strong>Keep competitions in view.</strong> Add A, B or C priority
              events. AthleteOS reviews a rolling 42 days, with the next 14 in
              focus.
            </p>
            <p>
              <strong>Listen to patterns.</strong> A personal recovery baseline
              needs 7 valid check-ins in the prior 14 days. Gaps stay unknown.
            </p>
            <p>
              <strong>You make the decisions.</strong> Every suggestion explains
              its inputs. Adjustments need your acceptance, and can be undone in
              Settings.
            </p>
            <p>
              <strong>Own your data.</strong> No data is sent to a server.
              Export backups regularly. Browser and device storage are separate.
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => setDialog(undefined)}
          >
            Got it
          </button>
        </Modal>
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          description={confirm.description}
          onClose={() => setConfirm(undefined)}
          onConfirm={async () => {
            await run(confirm.fn, "Records deleted.");
            setConfirm(undefined);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Activity size={23} strokeWidth={2.2} />
      </span>
      <span>
        Athlete<span className="brand-os">OS</span>
      </span>
    </div>
  );
}
function OverrideForm({
  data,
  dataset,
  date,
  onClose,
}: {
  data: Data;
  dataset: Dataset;
  date: string;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const current = data.overrides
    .filter((o) => o.until >= date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <Modal
      title="Choose your training emphasis"
      description="Your choice takes precedence. Recovery observations remain visible."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await db.overrides.put({
              ...identity(dataset),
              phase: String(f.get("phase")) as Phase,
              until: String(f.get("until")),
              reason: String(f.get("reason")),
            });
            onClose();
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        <Field label="Training emphasis">
          <select name="phase" defaultValue={current?.phase ?? "Maintain"}>
            {phases.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Until (inclusive)">
          <input
            type="date"
            name="until"
            min={date}
            max={addDays(date, 41)}
            defaultValue={current?.until ?? addDays(date, 6)}
            required
          />
        </Field>
        <Field label="Reason">
          <textarea
            name="reason"
            required
            defaultValue={current?.reason}
            placeholder="Why does this fit your situation?"
          />
        </Field>
        <ErrorMessage error={error} />
        <div className="form-actions">
          {current && (
            <button
              type="button"
              className="button"
              onClick={async () => {
                try {
                  await db.overrides.where("dataset").equals(dataset).delete();
                  onClose();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Use automatic emphasis
            </button>
          )}
          <button className="button primary">Save override</button>
        </div>
      </form>
    </Modal>
  );
}
