import { afterEach, describe, expect, it } from "vitest";
import {
  AthleteDatabase,
  applySuggestion,
  db,
  deleteSession,
  parseBackup,
  readData,
  replaceData,
  saveSession,
  serialize,
  undoDecision,
} from "../src/db";
import { defaultProfile, identity } from "../src/domain/models";
import { sampleData } from "../src/domain/sample";
import { planTraining } from "../src/domain/planner";
const date = "2026-10-29";
afterEach(async () => {
  for (const t of db.tables) await t.clear();
});
describe("durable transactions and isolation", () => {
  it("sample reset cannot overwrite the personal dataset", async () => {
    await db.profiles.put({ ...defaultProfile(), name: "Real athlete" });
    await replaceData(sampleData(date), "sample");
    expect((await db.profiles.get("personal"))?.name).toBe("Real athlete");
    expect((await readData("personal")).sessions).toHaveLength(0);
    const count = (await readData("sample")).sessions.length;
    expect(count).toBeGreaterThan(20);
    await replaceData(sampleData(date), "sample");
    expect((await readData("sample")).sessions).toHaveLength(count);
  });
  it("backup restoration remaps references and preserves data across a database reopen", async () => {
    await replaceData(sampleData(date), "personal");
    const before = await readData("personal");
    expect(before.exercises[0].sessionId.startsWith("personal:")).toBe(true);
    const backup = parseBackup(serialize(before));
    await replaceData(backup, "personal");
    db.close();
    await db.open();
    const after = await readData("personal");
    expect(after.sessions).toEqual(before.sessions);
    expect(after.sets).toEqual(before.sets);
  });
  it("persists exact RPE mode preferences", async () => {
    await db.profiles.put({ ...defaultProfile(), defaultRpeMode: "detailed" });
    db.close();
    await db.open();
    expect((await db.profiles.get("personal"))?.defaultRpeMode).toBe(
      "detailed",
    );
  });
  it("applies only with explicit acceptance, preserves original and undoes atomically", async () => {
    await replaceData(sampleData(date), "sample");
    let data = await readData("sample");
    const suggestion = planTraining(data, date).suggestions.find(
      (s) => s.planId,
    )!;
    const before = data.plans.find((p) => p.id === suggestion.planId)!;
    expect(before.duration).toBe(60);
    await applySuggestion(suggestion, "sample", date);
    data = await readData("sample");
    expect(data.plans.find((p) => p.id === before.id)?.duration).toBe(45);
    const decision = data.decisions.find((d) => d.status === "applied")!;
    expect(decision.original?.duration).toBe(60);
    await undoDecision(decision);
    expect((await db.plans.get(before.id))?.duration).toBe(60);
  });
  it("does not undo over a newer manual change", async () => {
    await replaceData(sampleData(date), "sample");
    const s = planTraining(await readData("sample"), date).suggestions.find(
      (s) => s.planId,
    )!;
    await applySuggestion(s, "sample", date);
    await db.plans.update(s.planId!, { duration: 30, updatedAt: "changed" });
    const d = (await readData("sample")).decisions[0];
    await expect(undoDecision(d)).rejects.toThrow("changed after");
  });
  it("links completion exactly once and restores plan on deletion", async () => {
    await replaceData(sampleData(date), "sample");
    const p = (await readData("sample")).plans.find(
      (p) => p.status === "planned",
    )!;
    const s = {
      ...identity("sample"),
      date: p.date,
      time: p.time,
      title: p.title,
      category: p.category,
      durationMinutes: 90,
      rpe: 7,
      rpeInputMode: "quick" as const,
      sessionLoad: 630,
      notes: "",
      subtype: "",
      modality: "",
      results: "",
      plannedSessionId: p.id,
    };
    await saveSession(s);
    expect((await db.plans.get(p.id))?.status).toBe("completed");
    await expect(saveSession({ ...s, ...identity("sample") })).rejects.toThrow(
      "already been completed",
    );
    await deleteSession(s);
    expect((await db.plans.get(p.id))?.status).toBe("planned");
  });
  it("fails invalid imports before changing existing records", async () => {
    await db.profiles.put(defaultProfile());
    const data = sampleData(date);
    data.sessions[0].rpe = 11;
    await expect(replaceData(data, "personal")).rejects.toThrow("Invalid");
    expect(await db.profiles.get("personal")).toBeDefined();
  });
  it("supports the same schema in another database instance", async () => {
    const other = new AthleteDatabase("athleteos-test-version");
    await replaceData(sampleData(date), "sample", other);
    expect(other.verno).toBe(4);
    expect((await readData("sample", other)).profile?.name).toBe("Alex Morgan");
    other.close();
    await other.delete();
  });
});
