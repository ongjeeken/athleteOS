import { addDays, weekday } from "./dates";
import {
  defaultProfile,
  emptyData,
  identity,
  type Data,
  type Dataset,
} from "./models";
export function sampleData(date: string): Data {
  const d = emptyData(),
    dataset: Dataset = "sample";
  d.profile = {
    ...defaultProfile("sample"),
    name: "Alex Morgan",
    timezone: "Asia/Singapore",
    goals: "Arrive sharp for Nationals. Build strength between competitions.",
  };
  const meta = (id: string) => identity(dataset, `sample:${id}`);
  for (let i = 41; i >= 1; i--) {
    const day = addDays(date, -i);
    if (weekday(day) !== 0 && weekday(day) !== 3) {
      const category =
        i % 5 === 0
          ? "Conditioning"
          : i % 3 === 0
            ? "Strength"
            : i % 7 === 0
              ? "Mobility"
              : "Fencing";
      d.sessions.push({
        ...meta("session-" + i),
        date: day,
        time: "18:30",
        title:
          category === "Fencing"
            ? i % 2
              ? "Tactical sparring"
              : "Footwork & technical drills"
            : category === "Strength"
              ? "Strength & power"
              : category === "Conditioning"
                ? "Aerobic intervals"
                : "Mobility & recovery",
        category,
        durationMinutes:
          category === "Fencing"
            ? 75 + (i % 3) * 15
            : category === "Strength"
              ? 60
              : 35,
        rpe: category === "Mobility" ? 2 : 5 + (i % 4),
        rpeInputMode: "quick",
        sessionLoad: 0,
        notes: "Fictional sample training.",
        subtype: category === "Fencing" ? "Mixed" : "",
        modality: "",
        results: "",
        ...(category === "Fencing"
          ? { bouts: 8, activeMinutes: 45, legFatigue: 5, cognitiveDemand: 6 }
          : {}),
      });
    }
    if (i <= 21 && i % 5 !== 0)
      d.checkIns.push({
        ...meta("check-" + i),
        date: day,
        sleepHours: 7 + (i % 3) / 2,
        sleep: 4,
        energy: i <= 2 ? 2 : 4,
        fatigue: i <= 2 ? 4 : 2,
        soreness: i <= 2 ? 4 : 2,
        stress: 2,
        mental: 3,
        motivation: 4,
        notes: "",
      });
  }
  for (const [i, name, priority, offset] of [
    [1, "Club Open", "C", -25],
    [2, "Regional Circuit", "B", -11],
    [3, "National Championships", "A", 6],
    [4, "City Fencing Open", "C", 13],
    [5, "Regional Cup", "B", 28],
  ] as const) {
    const start = addDays(date, offset);
    d.tournaments.push({
      ...meta("tournament-" + i),
      name,
      startDate: start,
      endDate: start,
      priority,
      location: i === 3 ? "Singapore Sports Hub" : "Singapore",
      goal: i === 3 ? "Fence with clarity. Finish in the top 16." : "",
      notes: "Fictional sample tournament",
      results: offset < 0 ? "Top 16" : "",
    });
    if (offset < 0)
      d.sessions.push({
        ...meta("competition-" + i),
        date: start,
        time: "09:00",
        category: "Competition",
        title: name,
        durationMinutes: 110,
        rpe: 8,
        rpeInputMode: "detailed",
        sessionLoad: 880,
        tournamentId: `sample:tournament-${i}`,
        subtype: "Competition",
        notes: "Actual exercise time including warm-up.",
        modality: "",
        results: "Top 16",
        bouts: 10,
        activeMinutes: 65,
        postFatigue: 8,
      });
  }
  for (let i = 0; i < 42; i++) {
    const day = addDays(date, i);
    const rest = weekday(day) === 0 || weekday(day) === 3;
    const comp = d.tournaments.some((t) => t.startDate === day);
    if (comp) continue;
    const category =
      i % 3 === 0 ? "Strength" : i % 5 === 0 ? "Conditioning" : "Fencing";
    d.plans.push({
      ...meta("plan-" + i),
      date: day,
      time: i === 0 ? "18:30" : "18:00",
      title: rest
        ? "Rest & reset"
        : category === "Strength"
          ? "Lower-body strength"
          : category === "Fencing"
            ? "Technical fencing"
            : "Aerobic conditioning",
      category: rest ? "Mobility" : category,
      subtype: "",
      duration: rest ? 0 : category === "Fencing" ? 90 : 60,
      rpe: rest ? null : category === "Strength" ? 7 : 6,
      notes: rest
        ? "Protect a day away from structured training."
        : "Focus on quality movement.",
      status: rest ? "rest" : "planned",
      locked: false,
    });
  }
  d.sessions.forEach(
    (s) => (s.sessionLoad = s.rpe === null ? null : s.durationMinutes * s.rpe),
  );
  const strength = d.sessions.find((s) => s.category === "Strength")!;
  const e = {
    ...meta("exercise-1"),
    sessionId: strength.id,
    name: "Back squat",
    emphasis: "Lower body" as const,
  };
  d.exercises.push(e);
  for (let i = 1; i <= 3; i++)
    d.sets.push({
      ...meta("set-" + i),
      exerciseId: e.id,
      order: i,
      reps: 5,
      weight: 70,
      setRpe: 7,
    });
  return d;
}
