import { test, expect, type Page } from "@playwright/test";
import { addDays, today, weekday, weekStart } from "../../src/domain/dates";
import { weekdays } from "../../src/minimal/model";

const date = today("Asia/Singapore");
const day = weekdays[(weekday(date) + 6) % 7];
async function setup(page: Page, competition = false) {
  await page.goto("/");
  await page
    .getByRole("button", { name: `Add Fencing on ${day}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gym / strength", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Add Gym / strength on ${day}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (competition) {
    await page
      .getByLabel("Competition date", { exact: true })
      .fill(addDays(date, 1));
    await page.getByLabel("Competition name optional").fill("Local Open");
    await page
      .getByRole("button", { name: "See my week", exact: true })
      .click();
  } else
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "Your intensity plan is ready." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Weekly intensity strategy" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: new RegExp(
        `^${day} .*daily demand ${competition ? "Light" : "Hard"}`,
      ),
    }),
  ).toBeVisible();
}

test("two-step onboarding, immediate week, one-tap logging, undo, details and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.getByRole("button", { name: "Go to today", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Today's daily demand" }),
  ).toContainText("Hard");
  await expect(
    page.getByRole("button", { name: "Easy", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Normal", exact: true }),
  ).toHaveCount(0);
  const fencing = page.getByRole("article", {
    name: "Fencing session",
    exact: true,
  });
  await fencing.getByRole("button", { name: "Moderate", exact: true }).click();
  await expect(fencing).toContainText("Completed · Actual: Moderate");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Today’s training." }),
  ).toBeVisible();
  await expect(fencing).toContainText("Completed · Actual: Moderate");
  await fencing.getByRole("button", { name: "Undo", exact: true }).click();
  await fencing.getByRole("button", { name: "Light", exact: true }).click();
  await fencing
    .getByRole("button", { name: "Add details", exact: true })
    .click();
  await expect(page.getByLabel(/duration/i)).toHaveCount(0);
  await page.getByLabel("Notes optional").fill("Technical bouts.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(fencing).not.toContainText(/\b\d+\s*min(?:utes)?\b/i);
  await page.reload();
  await fencing
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(page.getByLabel("Notes optional")).toHaveValue(
    "Technical bouts.",
  );
  expect(errors).toEqual([]);
});

test("competition observation appears before the phone agenda", async ({
  page,
  isMobile,
}) => {
  await setup(page, true);
  const observation = page.getByRole("region", {
    name: "Weekly intensity strategy",
  });
  await expect(observation).toContainText(
    "Keep training. Ease up close to competition.",
  );
  if (isMobile) {
    const insightBox = await observation.boundingBox();
    const agendaBox = await page
      .getByRole("heading", { name: "Day by day", exact: true })
      .boundingBox();
    expect(insightBox!.y).toBeLessThan(agendaBox!.y);
  }
  await page.getByRole("button", { name: "Go to today", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Next competition" }),
  ).toContainText("Local Open");
});

test("intensity override, different actual effort, priority changes and historical suggestions persist", async ({
  page,
}) => {
  await setup(page, true);
  await page.getByRole("button", { name: "Go to today", exact: true }).click();
  const fencing = page.getByRole("article", {
    name: "Fencing session",
    exact: true,
  });
  await expect(fencing.locator(".intensity-badge")).toHaveText("Light");
  await fencing.getByText("Why / adjust intensity", { exact: true }).click();
  await fencing.getByRole("button", { name: "Plan Hard", exact: true }).click();
  await expect(fencing.getByText("Your plan:", { exact: true })).toBeVisible();
  await expect(
    fencing.getByText("Suggested: Light", { exact: true }),
  ).toBeVisible();
  await fencing.getByRole("button", { name: "Light", exact: true }).click();
  await expect(fencing).toContainText("Completed · Actual: Light");
  const recorded = await page.evaluate(
    (d) =>
      JSON.parse(localStorage.getItem("athleteos-minimal-v1")!).sessions.find(
        (s: { date: string; kind: string }) =>
          s.date === d && s.kind === "fencing",
      ).recommendation,
    date,
  );
  await page
    .getByRole("button", { name: "Edit competition", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Regular competition", exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Competition date", { exact: true })
    .fill(addDays(date, 10));
  await page
    .getByRole("radio", { name: "Priority competition", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save competition", exact: true })
    .click();
  await page.reload();
  await expect(fencing).toContainText("Completed · Actual: Light");
  await expect(
    fencing.getByText("Suggested: Light", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (d) =>
        JSON.parse(localStorage.getItem("athleteos-minimal-v1")!).sessions.find(
          (s: { date: string; kind: string }) =>
            s.date === d && s.kind === "fencing",
        ).recommendation,
      date,
    ),
  ).toEqual(recorded);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  const gym = page.getByRole("article", {
    name: "Gym / strength session",
    exact: true,
  });
  await expect(gym.locator(".intensity-badge")).toHaveText("Light");
  await expect(
    page.getByRole("region", { name: "Weekly intensity strategy" }),
  ).toContainText("Priority competition");
});

test("one-off moves and routine edits preserve individual records and historical weeks", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Go to today", exact: true }).click();
  const fencing = page.getByRole("article", {
    name: "Fencing session",
    exact: true,
  });
  await fencing.getByRole("button", { name: "Hard", exact: true }).click();
  const gym = page.getByRole("article", {
    name: "Gym / strength session",
    exact: true,
  });
  await gym.getByRole("button", { name: "Add details", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill(addDays(date, 1));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(gym).toHaveCount(0);
  await page.getByRole("button", { name: "Your routine", exact: true }).click();
  await page
    .getByRole("button", { name: `Remove Fencing on ${day}`, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Remove Gym / strength on ${day}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save routine", exact: true }).click();
  await expect(fencing).toContainText("Completed · Actual: Hard");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  if (weekStart(addDays(date, 1)) !== weekStart(date))
    await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(gym).toBeVisible();
  await gym.getByRole("button", { name: "Skip session", exact: true }).click();
  await expect(gym).toContainText("Skipped");
  await gym.getByRole("button", { name: "Undo", exact: true }).click();
  await gym.getByRole("button", { name: "Edit session", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove session", exact: true })
    .click();
  await expect(gym).toHaveCount(0);
  await page
    .getByRole("status")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(gym).toBeVisible();
  await page.reload();
  await expect(fencing).toContainText("Completed · Actual: Hard");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Day by day", exact: true }),
  ).toBeVisible();
});

test("an empty routine works, unscheduled sessions save, and production works offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("button", { name: "Go to today", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Today's daily demand" }),
  ).toContainText("Rest");
  await expect(
    page.getByText("No sessions planned for today.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add a session", exact: true })
    .click();
  const form = page.locator(".add-session-form");
  await form
    .getByRole("button", { name: "Recovery / mobility", exact: true })
    .click();
  await form.getByRole("button", { name: "Add session", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Today's daily demand" }),
  ).toContainText("Light");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.getByRole("article")).toContainText(
    "Completed · Actual: Light",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("article")).toContainText(
    "Completed · Actual: Light",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Moderate", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("article")).toContainText(
    "Completed · Actual: Moderate",
  );
  await context.setOffline(false);
});
