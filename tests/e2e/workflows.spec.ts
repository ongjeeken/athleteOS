import { test, expect, type Page } from "@playwright/test";
import { today, addDays } from "../../src/domain/dates";
const date = today("Asia/Singapore");
async function nav(page: Page, label: string) {
  await page
    .getByRole("navigation", {
      name: (await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .isVisible())
        ? "Mobile navigation"
        : "Main navigation",
      exact: true,
    })
    .getByRole("button", { name: label, exact: true })
    .click();
}
async function onboard(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your name (optional)").fill("Jamie Test");
  await page
    .getByRole("button", { name: "No upcoming competitions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip this for now", exact: true })
    .click();
  await page.getByRole("button", { name: "Start my training plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Jamie." }),
  ).toBeVisible();
}
async function log(page: Page, title: string, rating?: string) {
  await nav(page, "Today");
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.locator("details > summary").click();
  await d.getByLabel("Session title (optional)").fill(title);
  await d.getByLabel("Actual duration (min)").fill("90");
  if (rating)
    await d
      .getByRole("radio", { name: new RegExp("^" + rating + " ") })
      .click();
  await d.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(d).not.toBeVisible();
}
test("onboarding, tournament, planning, quick RPE, recovery, editing, charts, persistence and backup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await onboard(page);
  await nav(page, "Calendar");
  await page.getByRole("button", { name: "Tournament", exact: true }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Tournament name").fill("Test Nationals");
  await d.getByLabel("Start date").fill(addDays(date, 6));
  await d.getByLabel("End date").fill(addDays(date, 6));
  await d.getByLabel("Priority", { exact: true }).selectOption("A");
  await d.getByRole("button", { name: "Save tournament" }).click();
  await expect(d).not.toBeVisible();
  await page
    .getByRole("button", { name: "Plan session", exact: true })
    .first()
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Session title", { exact: true }).fill("Gym quality");
  await d.getByLabel("Activity", { exact: true }).selectOption("Strength");
  await d.getByLabel("Date", { exact: true }).fill(date);
  await d.getByLabel("Planned duration (min)").fill("60");
  await d.getByLabel("Target RPE (optional)").fill("7");
  await d.getByRole("button", { name: "Save plan" }).click();
  await expect(d).not.toBeVisible();
  await nav(page, "Today");
  await expect(
    page.getByRole("heading", { name: "Test Nationals" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep the quality. Ease the volume."),
  ).toBeVisible();
  await page.getByText("Why this suggestion?").first().click();
  await expect(
    page.getByText(/product heuristics, not established fencing/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reduce to 45 min" }).click();
  await expect(page.getByText("45 min · Strength")).toBeVisible();
  await nav(page, "Settings");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await nav(page, "Today");
  await expect(page.getByText("60 min · Strength")).toBeVisible();
  await page.getByRole("button", { name: "Complete Gym quality" }).click();
  d = page.getByRole("dialog");
  await expect(d).toBeVisible();
  await expect(d.getByRole("radio", { checked: true })).toHaveCount(0);
  await d.getByLabel("Actual duration (min)").fill("90");
  await d.getByRole("radio", { name: /^Very Hard / }).click();
  await d.getByRole("button", { name: "Save session" }).click();
  await expect(d).not.toBeVisible();
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  d = page.getByRole("dialog");
  for (const name of [
    "Sleep quality",
    "Energy",
    "Fatigue",
    "Muscle soreness",
    "Stress",
  ])
    await d
      .getByRole("group", { name, exact: true })
      .getByRole("radio")
      .nth(2)
      .check();
  await d.getByRole("button", { name: "Save check-in" }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByText("Recorded", { exact: true })).toBeVisible();
  await nav(page, "Log Training");
  await expect(page.getByText("630 AU", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Gym quality", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Actual duration (min)").fill("60");
  await d.getByRole("button", { name: "Save session" }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByText("420 AU", { exact: true })).toBeVisible();
  await log(page, "Skipped effort");
  await nav(page, "Log Training");
  await expect(page.getByText("Load unknown")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your day, Jamie." }),
  ).toBeVisible();
  await nav(page, "Insights");
  await expect(
    page.getByRole("img", {
      name: "Daily recorded and planned session load in arbitrary units",
    }),
  ).toBeVisible();
  await expect(page.getByText("3/5").first()).toBeVisible();
  await nav(page, "Settings");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup" }).click();
  const backup = await dl;
  const path = await backup.path();
  expect(path).toBeTruthy();
  await page.getByLabel("Import backup file").setInputFiles(path!);
  await expect(
    page.getByRole("dialog", { name: "Restore this backup?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replace & restore" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await nav(page, "Log Training");
  await expect(page.getByText("420 AU", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Skipped effort", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Skipped effort", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("RPE default preferences persist, switching preserves effort, missing RPE stays unknown", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Actual duration (min)").fill("60");
  await expect(d.getByRole("radio")).toHaveCount(6);
  await d.getByRole("radio", { name: /^Hard / }).click();
  await d.getByRole("button", { name: "Use detailed RPE (0–10)" }).click();
  await expect(
    d.getByRole("radio", { name: "5 — Hard", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await d.getByRole("radio", { name: "8 — Extremely hard" }).click();
  await d.getByRole("button", { name: "Return to Quick Mode" }).click();
  await expect(d.getByText(/exact rating is preserved/)).toBeVisible();
  await d.getByRole("button", { name: "Save session" }).click();
  await expect(d).not.toBeVisible();
  await nav(page, "Settings");
  await page.getByLabel("Default RPE input mode").selectOption("detailed");
  await page
    .getByRole("button", { name: "Save profile & preferences" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Profile and preferences saved.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Actual duration (min)").fill("60");
  await expect(d.getByRole("radio")).toHaveCount(11);
  await expect(d.getByRole("radio", { checked: true })).toHaveCount(0);
  await d.getByRole("button", { name: "Return to Quick Mode" }).click();
  await d.getByRole("button", { name: "Skip RPE" }).click();
  await d.getByRole("button", { name: "Save session" }).click();
  await expect(d).not.toBeVisible();
  await nav(page, "Settings");
  await expect(page.getByLabel("Default RPE input mode")).toHaveValue(
    "detailed",
  );
  await nav(page, "Log Training");
  await expect(page.getByText("RPE 8", { exact: true })).toBeVisible();
  await expect(page.getByText("Load unknown", { exact: true })).toBeVisible();
});
test("sample isolation, suggestions, responsive surfaces, themes and production offline reload", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore sample athlete/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex." }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop")
    await page.screenshot({ path: "docs/preview.png", animations: "disabled" });
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-today.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Maximal / })).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Save session", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-rpe.png`,
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-dark.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await nav(page, "Calendar");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-calendar.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await nav(page, "Insights");
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-insights.png`,
    fullPage: true,
    animations: "disabled",
  });
  await nav(page, "Today");
  await page
    .locator(".recommendation")
    .first()
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(page.locator(".recommendation")).toHaveCount(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex." }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your day, Alex." }),
  ).toBeVisible();
  await expect(page.getByText("Working offline")).toBeVisible();
  await log(page, "Offline fencing", "Easy");
  await nav(page, "Log Training");
  await expect(
    page.getByRole("heading", { name: "Offline fencing" }),
  ).toBeVisible();
  await context.setOffline(false);
  await nav(page, "Today");
  await page.getByRole("button", { name: /Return to my data/ }).click();
  await expect(
    page.getByRole("heading", { name: "When are your upcoming competitions?" }),
  ).toBeVisible();
});
