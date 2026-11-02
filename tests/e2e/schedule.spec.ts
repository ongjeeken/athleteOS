import { test, expect, type Page } from "@playwright/test";
import { addDays, today, weekStart } from "../../src/domain/dates";
const date = today("Asia/Singapore");
async function nav(page: Page, label: string) {
  const name = (await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .isVisible())
    ? "Mobile navigation"
    : "Main navigation";
  await page
    .getByRole("navigation", { name, exact: true })
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill("Alex Planner");
  await page
    .getByRole("button", { name: "No upcoming competitions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip this for now", exact: true })
    .click();
  await page.getByRole("button", { name: "Start my training plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex." }),
  ).toBeVisible();
}
async function records(page: Page, name: string) {
  return page.evaluate(
    async (name) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open("athleteos");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(name, "readonly");
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => database.close();
        };
      }),
    name,
  );
}
async function seedActual(page: Page) {
  await page.evaluate(
    async ({ date, start }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("athleteos");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(
            ["sessions", "tournaments"],
            "readwrite",
          );
          const store = tx.objectStore("sessions");
          const plus = (s: string, n: number) =>
            new Date(Date.parse(s + "T12:00:00Z") + n * 86400000)
              .toISOString()
              .slice(0, 10);
          const now = new Date().toISOString();
          for (let w = 0; w < 4; w++) {
            for (const [offset, category, time, duration, title] of [
              [0, "Strength", "08:00", 60, "Gym"],
              [0, "Fencing", "18:00", 120, "Fencing"],
              [2, "Fencing", "18:00", 90, "Fencing"],
            ] as const) {
              store.put({
                id: `source-${w}-${offset}-${category}`,
                dataset: "personal",
                createdAt: now,
                updatedAt: now,
                date: plus(start, w * 7 + offset),
                time,
                title,
                category,
                durationMinutes: duration,
                rpe: null,
                rpeInputMode: "quick",
                sessionLoad: null,
                notes: "",
                subtype: "",
                modality: "",
                results: "",
              });
            }
          }
          store.put({
            id: "exception",
            dataset: "personal",
            createdAt: now,
            updatedAt: now,
            date: plus(start, 5),
            time: "",
            title: "City tournament",
            category: "Competition",
            durationMinutes: 300,
            rpe: null,
            rpeInputMode: "quick",
            sessionLoad: null,
            notes: "",
            subtype: "",
            modality: "",
            results: "",
          });
          tx.objectStore("tournaments").put({
            id: "future-cup",
            dataset: "personal",
            createdAt: now,
            updatedAt: now,
            name: "Future Nationals",
            startDate: plus(date, 4),
            endDate: plus(date, 4),
            priority: "A",
            location: "",
            goal: "",
            results: "",
            notes: "",
          });
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { date, start: addDays(weekStart(date), -28) },
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex." }),
  ).toBeVisible();
}
test("four weeks of actual history become an editable eight-week recurring plan with independent sessions and protected occurrence edits", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await seedActual(page);
  const actualBefore = await records(page, "sessions");
  await nav(page, "Calendar");
  await page
    .getByRole("button", {
      name: "Use My Training History to Plan Ahead",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Find my pattern", exact: true })
    .click();
  await expect(page.locator(".pattern-row")).toHaveCount(4);
  await expect(
    page.getByText("Competition is an exceptional event", { exact: false }),
  ).not.toBeVisible();
  await page
    .getByText("1 exceptional or estimated sessions excluded", { exact: false })
    .click();
  await expect(
    page.getByText("Competition is an exceptional event", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit suggested week", exact: true })
    .click();
  await page.getByLabel("Typical duration for Strength / Gym (min)").fill("55");
  await page.getByLabel("Week / template name").fill("My actual routine");
  await page
    .getByRole("button", { name: "Save reusable template", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records(page, "templates")).filter(
          (t) => t.name === "My actual routine",
        ).length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Next 8 weeks", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview future calendar", exact: false })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review your future calendar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".proposed-occurrence")).toHaveCount(24);
  await expect(page.locator(".has-conflict").first()).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-history-plan.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save future schedule", exact: true })
    .click();
  await expect.poll(async () => (await records(page, "plans")).length).toBe(24);
  expect(await records(page, "sessions")).toEqual(actualBefore);
  expect(await records(page, "recurrences")).toHaveLength(1);
  await page
    .getByRole("button", { name: "Back to calendar", exact: true })
    .click();
  const plans = await records(page, "plans");
  const gym = plans
    .filter((p) => p.title === "Gym")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  await page
    .getByRole("button", { name: `View ${gym.date}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Edit Gym", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Planned duration (min)").fill("40");
  await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await records(page, "recurrenceExceptions")).length)
    .toBe(1);
  await page
    .getByRole("button", { name: "Plan Training", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit recurring series", exact: true })
    .click();
  await page.getByLabel("Typical duration for Strength / Gym (min)").fill("50");
  await page
    .getByRole("button", { name: "Preview future calendar", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Save recurring changes", exact: true })
    .click();
  const after = await records(page, "plans");
  expect(after.find((p) => p.id === gym.id)?.duration).toBe(40);
  expect(
    after
      .filter((p) => p.title === "Gym" && p.id !== gym.id)
      .every((p) => p.duration === 50),
  ).toBe(true);
  await page.reload();
  expect(
    (await records(page, "templates")).some(
      (t) => t.name === "My actual routine",
    ),
  ).toBe(true);
  expect(await records(page, "plans")).toHaveLength(24);
  expect(await records(page, "sessions")).toEqual(actualBefore);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("pasted weeks support inline edits, bulk historical review, optional RPE and reusable templates", async ({
  page,
}, testInfo) => {
  await start(page);
  await nav(page, "Calendar");
  await page
    .getByRole("button", { name: "Reconstruct History", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Paste Training Schedule", exact: true })
    .click();
  await page
    .getByLabel("Training schedule", { exact: true })
    .fill(
      "Mon: Gym 60m AM, Fencing 120m PM\nWed: Conditioning 30m AM, Fencing 90m PM\nSat: Footwork 45m, Sparring 120m",
    );
  await page.getByLabel("Use pasted training for").selectOption("past");
  await page
    .getByRole("button", { name: "Preview pasted schedule", exact: true })
    .click();
  await expect(page.locator(".paste-preview li")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Edit parsed week", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Previous 4 weeks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review proposed history", exact: true })
    .click();
  await expect(
    page.getByText("24 proposed records", { exact: true }),
  ).toBeVisible();
  expect(await records(page, "sessions")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm range…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply to proposed records", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-bulk-history.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save reviewed history", exact: true })
    .click();
  await expect
    .poll(async () => (await records(page, "sessions")).length)
    .toBe(24);
  expect(await records(page, "sessions")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rpe: null, sessionLoad: null }),
    ]),
  );
  expect(await records(page, "sessions")).toEqual(
    expect.arrayContaining([expect.objectContaining({ timeOfDay: "Morning" })]),
  );
  await page.reload();
  expect(await records(page, "sessions")).toHaveLength(24);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
