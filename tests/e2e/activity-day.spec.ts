import { test, expect, type Page } from "@playwright/test";
import { today, addDays } from "../../src/domain/dates";
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
async function table(page: Page, name: string) {
  return page.evaluate(
    async (name) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const r = indexedDB.open("athleteos");
        r.onsuccess = () => {
          const d = r.result,
            t = d.transaction(name, "readonly"),
            q = t.objectStore(name).getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          t.oncomplete = () => d.close();
        };
      }),
    name,
  );
}
async function enterWeek(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill("Alex Athlete");
  await page
    .getByRole("button", { name: "No upcoming competitions", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="onboarding"]'),
  ).toBeVisible();
  for (const label of [
    "Fencing on Monday",
    "Fencing on Thursday",
    "Strength / Gym on Monday",
  ])
    await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByLabel("Typical duration for Fencing (min)").fill("90");
  await page.getByLabel("Typical duration for Strength / Gym (min)").fill("60");
  await page
    .getByRole("button", { name: /Another Session.*for Fencing/ })
    .click();
  await page
    .getByRole("button", { name: "Add another Fencing session", exact: true })
    .click();
}
async function finish(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Start my training plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex.", exact: true }),
  ).toBeVisible();
}
test("one activity selector is reused for onboarding, future planning and saved usual routines, with independent sessions and unknown duration", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterWeek(page);
  await page.getByLabel("Custom training category").fill("Pilates");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByRole("button", { name: "Pilates on Tuesday", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Weekly routine count" }),
  ).toContainText("5 sessions per week");
  await expect(
    page.getByRole("button", { name: "Fencing on Monday", exact: true }),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: /Another Session.*for Fencing/ })
    .click();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-activity-selector.png`,
    fullPage: true,
  });
  await finish(page);
  const profile = (await table(page, "profiles"))[0],
    routine = profile.weeklyRules as Record<string, unknown>[];
  expect(routine).toHaveLength(5);
  expect(new Set(routine.map((r) => r.id)).size).toBe(5);
  expect(
    routine.find((r) => r.customActivity === "Pilates")?.durationMinutes,
  ).toBeNull();
  expect(
    (await table(page, "templates")).some(
      (t) => t.name === "My Usual Training Week",
    ),
  ).toBe(true);
  expect(await table(page, "sessions")).toHaveLength(0);
  await nav(page, "Calendar");
  await page
    .getByRole("button", { name: "Plan Training", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="future"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fencing on Monday", exact: true }),
  ).toHaveText("2");
  await expect(
    page.getByRole("button", { name: "Add session on Monday", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Fencing on Friday", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use My Usual Training Week", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fencing on Friday", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Plan from", { exact: true }).fill(addDays(date, 14));
  await page.getByRole("button", { name: "Next 8 weeks", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview future calendar", exact: false })
    .click();
  await expect(page.locator(".proposed-occurrence")).toHaveCount(40);
  await expect(
    page.getByText("Duration unknown", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save future schedule", exact: true })
    .click();
  await expect.poll(async () => (await table(page, "plans")).length).toBe(50);
  const before = await table(page, "plans");
  expect(before.filter((p) => p.duration === null)).toHaveLength(10);
  await page
    .getByRole("button", { name: "Back to calendar", exact: true })
    .click();
  const recurring = before
    .filter((p) => p.seriesId && p.category === "Strength")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  for (
    let i = 0;
    i < 3 &&
    !(await page
      .getByRole("button", { name: `View ${recurring.date}`, exact: true })
      .isVisible());
    i++
  )
    await page
      .getByRole("button", { name: "Next period", exact: true })
      .click();
  await page
    .getByRole("button", { name: `View ${recurring.date}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Strength session", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Apply this change to")).toHaveValue(
    "session",
  );
  await dialog.getByLabel("Planned duration (min)").fill("35");
  await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await table(page, "profiles"))[0].weeklyRules).toEqual(routine);
  await page
    .getByRole("button", { name: "Edit Strength session", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Planned duration (min)").fill("50");
  await dialog.getByLabel("Apply this change to").selectOption("future");
  await dialog
    .getByRole("button", { name: "Review routine changes", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="future"]'),
  ).toBeVisible();
  await expect(
    page.getByLabel("Typical duration for Strength / Gym (min)"),
  ).toHaveValue("50");
  expect((await table(page, "profiles"))[0].weeklyRules).toEqual(routine);
  const afterIndividual = await table(page, "plans");
  expect(afterIndividual.find((p) => p.id === recurring.id)?.duration).toBe(35);
  expect(
    afterIndividual
      .filter(
        (p) => p.seriesId && p.category === "Strength" && p.id !== recurring.id,
      )
      .every((p) => p.duration === 60),
  ).toBe(true);
  await nav(page, "Settings");
  await page
    .getByRole("button", { name: "My Usual Training Week", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="future"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Fencing on Friday", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save typical week", exact: true })
    .click();
  expect(await table(page, "plans")).toEqual(afterIndividual);
  await page.reload();
  const saved = (await table(page, "profiles"))[0].weeklyRules as Record<
    string,
    unknown
  >[];
  expect(saved).toHaveLength(6);
  expect(await table(page, "sessions")).toHaveLength(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("history preloads the usual selector, confirms remembered sessions and keeps routine changes separate from history", async ({
  page,
}) => {
  await enterWeek(page);
  await finish(page);
  await nav(page, "Calendar");
  await page
    .getByRole("button", { name: "Reconstruct History", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="history"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fencing on Monday", exact: true }),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: "Previous 4 weeks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review proposed history", exact: true })
    .click();
  await expect(
    page.getByText("16 proposed records", { exact: true }),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm range…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply to proposed records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save reviewed history", exact: true })
    .click();
  await expect
    .poll(async () => (await table(page, "sessions")).length)
    .toBe(16);
  const actual = await table(page, "sessions"),
    routine = (await table(page, "profiles"))[0].weeklyRules;
  expect(actual.every((s) => s.rpe === null && s.sessionLoad === null)).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Use My Recent Training", exact: true })
    .click();
  await page.locator(".pattern-options > summary").click();
  await page
    .getByText("Consider athlete-confirmed duration estimates", {
      exact: false,
    })
    .click();
  await page
    .getByRole("button", { name: "Find my pattern", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit suggested week", exact: true })
    .click();
  await expect(
    page.locator('.activity-day-selector[data-context="future"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fencing on Monday", exact: true }),
  ).toHaveText("2");
  expect((await table(page, "profiles"))[0].weeklyRules).toEqual(routine);
  await page
    .getByRole("button", { name: "Fencing on Wednesday", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Update my usual training week", exact: true })
    .click();
  expect(await table(page, "sessions")).toEqual(actual);
  await page.reload();
  expect(await table(page, "sessions")).toEqual(actual);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
