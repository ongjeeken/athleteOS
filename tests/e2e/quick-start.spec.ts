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
        const request = indexedDB.open("athleteos");
        request.onerror = () => reject(request.error);
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
async function simpleStart(page: Page, template = false) {
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill("Riley Athlete");
  await page
    .getByRole("button", { name: "No upcoming competitions", exact: true })
    .click();
  if (template) {
    for (const day of ["Monday", "Saturday"])
      await page
        .getByRole("button", { name: `Fencing on ${day}`, exact: true })
        .click();
    await page
      .getByRole("button", { name: "Strength / Gym on Wednesday", exact: true })
      .click();
    await page.getByLabel("Typical duration for Fencing (min)").fill("90");
    await page
      .getByLabel("Typical duration for Strength / Gym (min)")
      .fill("60");
  }
  await page
    .getByRole("button", {
      name: template ? "Continue" : "Skip this for now",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Start my training plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
}
async function openHistory(page: Page) {
  await nav(page, "Settings");
  await page
    .getByRole("button", { name: "Add or review historical training" })
    .click();
}
test("three-step onboarding autosaves competitions and a multi-session weekly template, then shows a provisional plan", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "When are your upcoming competitions?" }),
  ).toBeVisible();
  await page.getByLabel("Your name (optional)").fill("Riley Athlete");
  for (const [name, offset, priority] of [
    ["Nationals", 6, "A"],
    ["City Cup", 20, "C"],
  ] as const) {
    await page
      .getByRole("button", { name: "Add competition", exact: true })
      .click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Competition name (optional)").fill(name);
    await d.getByLabel("Start date").fill(addDays(date, offset));
    await d.getByLabel("End date").fill(addDays(date, offset + 1));
    await d.getByLabel("Competition priority").selectOption(priority);
    await d.getByRole("button", { name: "Save competition" }).click();
    await expect(d).not.toBeVisible();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const [activity, days, duration] of [
    ["Fencing", ["Monday", "Thursday"], 90],
    ["Strength / Gym", ["Tuesday", "Friday"], 60],
    ["Conditioning", ["Saturday"], 45],
    ["Mobility / Recovery", ["Monday"], 20],
  ] as const) {
    for (const day of days)
      await page
        .getByRole("button", { name: `${activity} on ${day}`, exact: true })
        .click();
    await page
      .getByLabel(`Typical duration for ${activity} (min)`)
      .fill(String(duration));
  }
  await page.locator(".selector-availability > summary").click();
  await page
    .locator(".selector-availability")
    .getByLabel("Sunday availability")
    .selectOption("unavailable");
  await expect(page.locator(".setup-saved")).toContainText("Progress saved");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Your usual training week",
    }),
  ).toBeVisible();
  await page.locator(".selector-availability > summary").click();
  await expect(
    page.locator(".selector-availability").getByLabel("Sunday availability"),
  ).toHaveValue("unavailable");
  await expect(
    page.getByRole("button", {
      name: "Mobility / Recovery on Monday",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-setup-week.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nationals", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("radio", { name: "Strength and power", exact: true })
    .click();
  await page
    .getByText("Is anything affecting your normal training? (optional)")
    .click();
  await page
    .getByLabel("Current training context")
    .selectOption("Temporarily reduced training availability");
  await page.getByRole("button", { name: "Start my training plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your next 14 days", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Open plan / })).toHaveCount(
    14,
  );
  await expect(
    page
      .locator(".starting-pattern")
      .getByText("Strength and power", { exact: true }),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  expect(await table(page, "checkIns")).toHaveLength(0);
  expect(await table(page, "tournaments")).toHaveLength(2);
  const plans = await table(page, "plans");
  expect(plans.filter((p) => p.status === "planned").length).toBeGreaterThan(8);
  expect(plans.every((p) => p.rpe === null)).toBe(true);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-provisional-plan.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("reconstructed history is reviewed, remembered effort is optional, and uncertain sessions remain separate", async ({
  page,
}) => {
  await simpleStart(page, true);
  await openHistory(page);
  await page
    .getByRole("button", { name: /Reconstruct My Recent Training/ })
    .click();
  await page.getByLabel("How far back?").selectOption("2");
  await page.getByRole("button", { name: "Generate proposed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the training you remember" }),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  await page.getByRole("button", { name: "Save reviewed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  expect(await table(page, "history")).toHaveLength(6);
  await page
    .getByRole("button", { name: "Review uncertain history", exact: true })
    .click();
  const row = page.locator(".review-row").first();
  await row.getByRole("combobox").selectOption("completed");
  await row.getByRole("button", { name: "Edit details / effort" }).click();
  const d = page.getByRole("dialog");
  await d
    .getByText("Add remembered effort (optional)", { exact: true })
    .click();
  await expect(d.getByRole("radio", { checked: true })).toHaveCount(0);
  await d.getByRole("radio", { name: /^Very Hard / }).click();
  await d.getByRole("button", { name: "Use detailed RPE (0–10)" }).click();
  await expect(
    d.getByRole("radio", { name: "7 — Very hard", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await d.getByRole("button", { name: "Save proposed entry" }).click();
  await page.getByRole("button", { name: "Save reviewed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  const sessions = await table(page, "sessions");
  expect(sessions).toHaveLength(1);
  expect(sessions[0].rpe).toBe(7);
  expect(sessions[0].rpeInputMode).toBe("detailed");
  expect(
    (sessions[0].provenance as { estimatedFields: string[] }).estimatedFields,
  ).toContain("durationMinutes");
  expect(
    (await table(page, "history")).filter((h) => h.status === "unconfirmed"),
  ).toHaveLength(5);
  await nav(page, "Insights");
  await expect(
    page.getByRole("heading", { name: "Training time and attendance" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `1 sessions · approximately ${sessions[0].durationMinutes} minutes`,
    ),
  ).toBeVisible();
});
test("CSV drag-and-drop, mapping, preview, exclusion, explicit completion and duplicate re-import all stay local", async ({
  page,
}) => {
  await simpleStart(page);
  await openHistory(page);
  await page.getByRole("button", { name: /Import existing training/ }).click();
  const csv = `date,title,durationMinutes,rpe,status\n${addDays(date, -3)},Fencing practice,60,,completed\n${addDays(date, -3)},Work meeting,30,,completed\n${addDays(date, -3)},Fencing practice,60,,completed`;
  const dt = await page.evaluateHandle(
    ({ csv }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], "history.csv", { type: "text/csv" }));
      return transfer;
    },
    { csv },
  );
  await page
    .locator(".history-dropzone")
    .dispatchEvent("drop", { dataTransfer: dt });
  await expect(page.getByText("Selected: history.csv")).toBeVisible();
  await expect(page.getByLabel("Title column", { exact: true })).toHaveValue(
    "title",
  );
  await page.getByRole("button", { name: "Preview records" }).click();
  await expect(page.getByText("1 likely duplicates excluded")).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  await page
    .getByLabel("Status for Fencing practice")
    .first()
    .selectOption("completed");
  await page.getByRole("button", { name: "Save reviewed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  const saved = await table(page, "sessions");
  expect(saved).toHaveLength(1);
  expect(saved[0].rpe).toBeNull();
  expect(saved[0].sessionLoad).toBeNull();
  await openHistory(page);
  await page.getByRole("button", { name: /Import existing training/ }).click();
  await page.getByLabel("Historical data file").setInputFiles({
    name: "again.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Preview records" }).click();
  await expect(page.getByText("2 likely duplicates excluded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save reviewed history" }),
  ).toBeDisabled();
  expect(await table(page, "sessions")).toHaveLength(1);
});
test("no-history and no-competition paths remain usable, and recurring ICS events start unverified", async ({
  page,
}) => {
  await simpleStart(page);
  await expect(
    page.getByText(
      "No upcoming competitions. Your provisional plan focuses on general training development.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start from today/ }).click();
  await expect(page.locator(".history-choices")).toHaveCount(0);
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await expect(page.getByRole("radio")).toHaveCount(6);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await openHistory(page);
  await page.getByRole("button", { name: /Import existing training/ }).click();
  const start = addDays(date, -14).replaceAll("-", "");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fencing\r\nDTSTART;TZID=Asia/Singapore:${start}T180000\r\nDTEND;TZID=Asia/Singapore:${start}T193000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:Fencing\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  await page.getByLabel("Historical data file").setInputFiles({
    name: "training.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(ics),
  });
  await page.getByRole("button", { name: "Preview records" }).click();
  await expect(page.getByText("2 proposed records")).toBeVisible();
  await page.getByRole("button", { name: "Confirm range…" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm this range as completed?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/2 included sessions/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Save reviewed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  expect(
    (await table(page, "history")).every(
      (h) => h.status === "unconfirmed" && h.rpe === null,
    ),
  ).toBe(true);
});

test("bulk review previews decisions and exceptional tournaments never become workload", async ({
  page,
}) => {
  await simpleStart(page, true);
  await openHistory(page);
  await page
    .getByRole("button", { name: /Reconstruct My Recent Training/ })
    .click();
  await page.getByLabel("How far back?").selectOption("2");
  await page.getByRole("button", { name: "Generate proposed history" }).click();
  await page.getByRole("button", { name: "Confirm range…" }).click();
  await expect(
    page.getByRole("dialog").getByText(/6 included sessions/),
  ).toBeVisible();
  expect(await table(page, "sessions")).toHaveLength(0);
  await page.getByRole("button", { name: "Apply to proposed records" }).click();
  await page
    .locator(".review-row")
    .first()
    .getByRole("combobox")
    .selectOption("missed");
  await page
    .getByRole("button", { name: "Exceptional session or tournament" })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Entry type").selectOption("tournament");
  await d.getByLabel("Historical entry name").fill("Extra Cup");
  await d.getByRole("button", { name: "Save proposed entry" }).click();
  await expect(d).not.toBeVisible();
  await page
    .locator(".review-row")
    .filter({
      has: page.getByRole("heading", { name: "Extra Cup", exact: true }),
    })
    .getByRole("combobox")
    .selectOption("completed");
  await page.getByRole("button", { name: "Save reviewed history" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Riley." }),
  ).toBeVisible();
  const sessions = await table(page, "sessions");
  expect(sessions).toHaveLength(5);
  expect(sessions.every((s) => s.rpe === null && s.sessionLoad === null)).toBe(
    true,
  );
  expect(await table(page, "tournaments")).toHaveLength(1);
  expect(
    (await table(page, "history")).filter((h) => h.status === "missed"),
  ).toHaveLength(1);
});
