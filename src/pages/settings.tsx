import { useRef, useState } from "react";
import {
  Database,
  Download,
  FileJson,
  FlaskConical,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Data, Dataset } from "../domain/models";
import { db, csv, download, parseBackup, replaceData, serialize } from "../db";
import { ProfileFields, errorText } from "../components/forms";
import { ErrorMessage, Modal, SectionTitle } from "../components/ui";
import { fmt } from "../domain/dates";
export function SettingsPage({
  data,
  dataset,
  date,
  onNotify,
  onHistory,
  onTypicalWeek,
  onDemo,
  onClearSample,
  onUndo,
  onRestoreSuggestions,
}: {
  data: Data;
  dataset: Dataset;
  date: string;
  onNotify: (msg: string) => void;
  onHistory: () => void;
  onTypicalWeek: () => void;
  onDemo: () => void;
  onClearSample: () => void;
  onUndo: (id: string) => void;
  onRestoreSuggestions: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<Data>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="settings-layout">
      <div>
        <section className="panel">
          <SectionTitle
            title="Athlete profile"
            detail="A plan that fits your life."
          />
          <div className="settings-setup-actions">
            <button className="button" onClick={onTypicalWeek}>
              My Usual Training Week
            </button>
            <button className="button" onClick={onHistory}>
              Add or review historical training
            </button>
          </div>
          <ProfileFields
            initial={data.profile!}
            onSubmit={async (p) => {
              await db.profiles.put(p);
              onNotify("Profile and preferences saved.");
            }}
          />
        </section>
        <section className="panel">
          <SectionTitle
            title="Your decision history"
            detail="Accepted adjustments preserve the original plan."
          />
          {data.decisions.length ? (
            <div>
              {[...data.decisions]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 20)
                .map((d) => (
                  <div className="audit-row" key={d.id}>
                    <div>
                      <strong>
                        {d.status === "applied"
                          ? "Adjustment accepted"
                          : d.status === "undone"
                            ? "Adjustment undone"
                            : "Suggestion dismissed"}
                      </strong>
                      <p>
                        {d.original
                          ? `${d.original.title}: ${d.original.duration} min → ${d.applied?.duration} min. ${d.original.date} → ${d.applied?.date}`
                          : d.rationale}
                      </p>
                      <small>
                        {fmt(d.createdAt.slice(0, 10))} · Algorithm{" "}
                        {d.algorithm}
                      </small>
                    </div>
                    {d.status === "applied" && (
                      <button
                        className="button small"
                        onClick={() => onUndo(d.id)}
                      >
                        Undo
                      </button>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted">
              Your adjustments and dismissed suggestions will appear here.
            </p>
          )}
          <button className="text-button" onClick={onRestoreSuggestions}>
            Show dismissed suggestions again
          </button>
        </section>
      </div>
      <aside>
        <section className="panel">
          <div className="settings-icon">
            <Database size={22} />
          </div>
          <SectionTitle
            title="Your data, your device"
            detail="No account. No subscription. No telemetry."
          />
          <p>
            Training and wellness records are stored in this browser’s
            IndexedDB. Separate browsers and devices do not share data
            automatically.
          </p>
          <p>
            Clearing site data or losing this device can remove your records.
            Keep periodic backups.
          </p>
          <div className="export-buttons">
            <button
              className="button"
              onClick={() => {
                download(`athleteos-${dataset}-${date}.json`, serialize(data));
                onNotify("Full JSON backup exported.");
              }}
            >
              <FileJson size={17} />
              Export full backup
            </button>
            <button
              className="button"
              onClick={() =>
                download(
                  `athleteos-training-${date}.csv`,
                  csv(
                    data.sessions.map((s) => ({
                      date: s.date,
                      time: s.time,
                      title: s.title,
                      category: s.category,
                      customActivity: s.customActivity,
                      durationMinutes: s.durationMinutes,
                      rpe: s.rpe,
                      rpeInputMode: s.rpeInputMode,
                      source: s.provenance?.source ?? "manual",
                      sourceName: s.provenance?.sourceName ?? "Directly logged",
                      durationQuality: s.provenance?.estimatedFields.includes(
                        "durationMinutes",
                      )
                        ? "estimated"
                        : "reported",
                      confirmationStatus: "completed",
                      sessionLoad: s.sessionLoad,
                      notes: s.notes,
                      bouts: s.bouts,
                      activeMinutes: s.activeMinutes,
                    })),
                  ),
                  "text/csv",
                )
              }
            >
              <Download size={17} />
              Training CSV
            </button>
            <button
              className="button"
              onClick={() =>
                download(
                  `athleteos-recovery-${date}.csv`,
                  csv(
                    data.checkIns.map((c) => ({
                      date: c.date,
                      sleepHours: c.sleepHours,
                      sleepQuality: c.sleep,
                      energy: c.energy,
                      fatigue: c.fatigue,
                      soreness: c.soreness,
                      stress: c.stress,
                      mentalFatigue: c.mental,
                      motivation: c.motivation,
                      notes: c.notes,
                    })),
                  ),
                  "text/csv",
                )
              }
            >
              <Download size={17} />
              Recovery CSV
            </button>
            <button className="button" onClick={() => file.current?.click()}>
              <Upload size={17} />
              Import JSON backup
            </button>
            <input
              ref={file}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Import backup file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError("");
                try {
                  if (f.size > 15 * 1024 * 1024)
                    throw new Error("Select a backup smaller than 15 MB.");
                  setImported(parseBackup(await f.text()));
                } catch (e) {
                  setError(errorText(e));
                }
                e.target.value = "";
              }}
            />
          </div>
          <ErrorMessage error={error} />
          <div className="privacy-note">
            <ShieldCheck size={16} />
            <span>
              Personal data never leaves this app unless you export it yourself.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="settings-icon">
            <FlaskConical size={22} />
          </div>
          <SectionTitle title="Explore with sample data" />
          <p>
            A fictional fencer, six weeks of training, recovery check-ins, and
            five competitions. Sample records live separately from your own.
          </p>
          <button className="button" onClick={onDemo}>
            {dataset === "sample" ? "Return to my data" : "Explore sample data"}
          </button>
          <button
            className="text-button destructive-text"
            onClick={onClearSample}
          >
            Clear sample data only
          </button>
        </section>
        <section className="panel">
          <SectionTitle title="Evidence & uncertainty" />
          <p>
            Session-RPE is a supported monitoring method. Planning windows,
            session reductions, and phase thresholds are configurable product
            heuristics.
          </p>
          <p>
            There is no injury probability or readiness score. Symptoms are
            observations and may warrant professional assessment.
          </p>
          <div className="science-links">
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/27140957/"
              target="_blank"
              rel="noreferrer"
            >
              Session-RPE in fencing
            </a>
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/26423706/"
              target="_blank"
              rel="noreferrer"
            >
              Subjective athlete monitoring
            </a>
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/17762369/"
              target="_blank"
              rel="noreferrer"
            >
              Tapering meta-analysis
            </a>
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/40695448/"
              target="_blank"
              rel="noreferrer"
            >
              Fencing & mental fatigue
            </a>
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/32502973/"
              target="_blank"
              rel="noreferrer"
            >
              ACWR methodological critique
            </a>
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/42662491/"
              target="_blank"
              rel="noreferrer"
            >
              ACWR review & limitations
            </a>
          </div>
          <p className="helper">
            AthleteOS 1.0 · Database schema 4 · Planner 1.1
            <br />
            Offline after the production app is loaded and cached. Install
            through your browser where supported.
          </p>
        </section>
      </aside>
      {imported && (
        <Modal
          title="Restore this backup?"
          description="Review the contents before replacing records."
          onClose={() => setImported(undefined)}
        >
          <p>
            The backup contains {imported.sessions.length} completed sessions,{" "}
            {imported.plans.length} plans, {imported.tournaments.length}{" "}
            tournaments and {imported.checkIns.length} recovery entries.
          </p>
          <p>
            This replaces all records in your{" "}
            <strong>{dataset === "sample" ? "sample" : "personal"}</strong>{" "}
            dataset. It does not merge duplicates. The other dataset is
            unaffected. Export a backup first to preserve your current records.
          </p>
          <div className="form-actions">
            <button className="button" onClick={() => setImported(undefined)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await replaceData(imported, dataset);
                  setImported(undefined);
                  onNotify("Backup restored successfully.");
                } catch (e) {
                  setError(errorText(e));
                  setImported(undefined);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Restoring…" : "Replace & restore"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
