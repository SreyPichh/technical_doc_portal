import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Acceptance scenarios A–F from the project brief, plus OCR, upload validation
 * and region restrictions. Tests run in order and share one database.
 */
test.describe.configure({ mode: "serial" });

const ADMIN = { email: "admin@nsk-portal.test", password: "Admin-Portal-2026!" };
const DEALER = { email: "dealer@sample-dealer.test", password: "Dealer-Portal-2026!" }; // Southeast Asia
const DEALER_ME = { email: "dealer2@sample-dealer.test", password: "Dealer-Portal-2026!" }; // Middle East

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const REF_PDF = "doc_sample/Technical_Information_TEC-26-049_EN-R1.pdf";

async function login(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail address").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|portal)/);
  return page;
}

async function openAdminDoc(page: Page, number: string) {
  await page.goto(`/admin/documents?q=${encodeURIComponent(number)}`);
  await page.getByTestId("admin-document-row").first().getByRole("link").first().click();
  await page.waitForURL(/\/admin\/documents\/[0-9a-f-]{36}/);
  return page.url().match(/documents\/([0-9a-f-]{36})/)![1];
}

async function openPortalDoc(page: Page, number: string) {
  await page.goto(`/portal/documents?q=${encodeURIComponent(number)}`);
  await page.getByTestId("document-row").first().getByRole("link", { name: /./ }).first().click();
  await page.waitForURL(/\/portal\/documents\/[0-9a-f-]{36}/);
}

async function downloadFrom(page: Page, testId: string) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  return { name: dl.suggestedFilename(), body: readFileSync((await dl.path())!) };
}

let draftR2Url = "";

test("Scenario C — search by document number, product model, order code and category", async ({ browser }) => {
  const page = await login(browser, DEALER);
  await page.goto("/portal/documents?q=TEC-26-049");
  await expect(page.getByTestId("document-row")).toHaveCount(1);
  await expect(page.getByTestId("document-row")).toContainText("Labeling Change of Dental Products (MDR)");

  // Order code that only appears inside the PDF's product table
  await page.goto("/portal/documents?q=U1020050");
  await expect(page.getByTestId("document-row")).toHaveCount(1);
  await expect(page.getByTestId("document-row")).toContainText("TEC-26-049");

  // Product model (from a PDF using full-width characters)
  await page.goto("/portal/documents?q=Z-SG45L");
  await expect(page.getByTestId("document-row").first()).toContainText("TEC-26-056");

  // Category filter via the UI
  await page.goto("/portal/documents");
  await page.getByTestId("filter-category").selectOption({ label: "Surgical & Implant" });
  await expect(page.getByTestId("result-count")).toHaveText(/^1 document/);
  await expect(page.getByTestId("document-row")).toContainText("Z-SG45L");
});

test("Scenario D — the five-page reference PDF renders, navigates, zooms and downloads unchanged", async ({ browser }) => {
  const page = await login(browser, DEALER);
  await openPortalDoc(page, "TEC-26-049");
  const viewer = page.getByTestId("pdf-viewer");
  await expect(viewer.getByTestId("page-count")).toHaveText("/ 5");
  await expect(viewer.locator(".pdf-page")).toHaveCount(5);
  await expect(viewer.locator(".pdf-page").first().locator("canvas")).toBeVisible();
  // Text layer present → selectable/searchable text
  await expect(viewer.locator(".pdf-page").first().locator(".textLayer span").first()).toBeAttached();

  // Zoom
  const before = await viewer.getByTestId("zoom-level").textContent();
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByTestId("zoom-level")).not.toHaveText(before!);

  // Page navigation renders the table page
  await viewer.getByLabel("Page number").fill("3");
  await viewer.getByLabel("Page number").press("Enter");
  await expect(viewer.locator('.pdf-page[data-page="3"] canvas')).toBeAttached();

  // Find text inside the product table (the find bar is pre-filled from the portal search)
  await expect(viewer.getByPlaceholder(/Find text/)).toHaveValue("TEC-26-049");
  await viewer.getByPlaceholder(/Find text/).fill("U1020050");
  await viewer.getByPlaceholder(/Find text/).press("Enter");
  await expect(viewer).toContainText("Page 3 · 1/1 page");
  await expect(viewer.locator('.pdf-page[data-page="3"] mark.pdf-hit')).toHaveText("U1020050");

  // Download returns the original file byte-for-byte
  const { body } = await downloadFrom(page, "download-pdf");
  expect(sha(body)).toBe(sha(readFileSync(REF_PDF)));
});

test("Upload validation rejects files that are not PDFs", async ({ browser }) => {
  const page = await login(browser, ADMIN);
  await page.goto("/admin/upload");
  await page.getByTestId("file-input").setInputFiles("e2e/fixtures/not-a-pdf.pdf");
  await expect(page.getByText(/not a valid PDF/i)).toBeVisible();
});

test("Scenario A — admin uploads and publishes a new document; dealer sees NEW, previews and downloads", async ({ browser }) => {
  const admin = await login(browser, ADMIN);
  await admin.goto("/admin/upload");
  await admin.getByTestId("mode-new").click();
  await admin.getByTestId("file-input").setInputFiles("e2e/fixtures/TEST-NEW-DOC.pdf");
  await expect(admin.getByTestId("upload-summary")).toContainText("2 pages");
  // Suggested metadata read from the PDF
  await expect(admin.getByLabel("Document number")).toHaveValue("TEST-99-001");
  await expect(admin.getByLabel("Document title")).toHaveValue("E2E Test Document For Upload");
  await admin.locator("#categoryId").selectOption({ label: "Laboratory" });
  await admin.getByLabel("Product models").fill("TESTMODEL-X1");
  await expect(admin.getByLabel("Revision number")).toHaveValue("R0");
  await admin.getByTestId("publish-now").click();
  await admin.waitForURL(/created=published/);
  await expect(admin.getByText(/created and published/)).toBeVisible();

  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal");
  const card = dealer.getByTestId("document-card").filter({ hasText: "E2E Test Document For Upload" });
  await expect(card).toBeVisible();
  await expect(card.locator('[data-label="NEW"]')).toBeVisible();
  await card.getByRole("link", { name: "Preview" }).click();
  await expect(dealer.getByTestId("pdf-viewer").getByTestId("page-count")).toHaveText("/ 2");
  const { body } = await downloadFrom(dealer, "download-pdf");
  expect(sha(body)).toBe(sha(readFileSync("e2e/fixtures/TEST-NEW-DOC.pdf")));

  // Search by the product model entered in metadata
  await dealer.goto("/portal/documents?q=TESTMODEL-X1");
  await expect(dealer.getByTestId("document-row")).toHaveCount(1);
});

test("Metadata editing updates catalogue data without changing the PDF or labels", async ({ browser }) => {
  const admin = await login(browser, ADMIN);
  const id = await openAdminDoc(admin, "TEST-99-001");
  await admin.goto(`/admin/documents/${id}?tab=metadata`);
  await admin.getByLabel("Product models").fill("TESTMODEL-X1, TESTMODEL-Y2");
  await admin.getByLabel("Short description").fill("Edited description (test).");
  await admin.getByTestId("save-metadata").click();
  await expect(admin.getByText("Metadata saved.")).toBeVisible();
  await admin.goto(`/admin/documents/${id}?tab=activity`);
  await expect(admin.getByText(/Edited metadata of TEST-99-001: .*productModels/)).toBeVisible();

  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal/documents?q=TESTMODEL-Y2");
  await expect(dealer.getByTestId("document-row")).toHaveCount(1);
  await expect(dealer.getByTestId("document-row").locator('[data-label="NEW"]')).toBeVisible();
});

test("Scenario B + F — new revision stays draft until approved, then dealers get UPDATED and the latest file; history kept", async ({ browser }) => {
  const admin = await login(browser, ADMIN);
  const docId = await openAdminDoc(admin, "TEC-26-049");
  await admin.getByTestId("upload-revision-link").click();
  await admin.waitForURL(/upload\?document=/);
  await admin.getByTestId("file-input").setInputFiles("e2e/fixtures/TEST-049-R2.pdf");
  await expect(admin.getByTestId("revision-compare")).toContainText("R1");
  await expect(admin.getByLabel("Revision number")).toHaveValue("R2");
  await admin.getByLabel("Revision notes").fill("Automated test revision.");
  await admin.getByTestId("save-draft").click();
  await admin.waitForURL(/revision=draft/);
  await expect(admin.getByTestId("pending-banner")).toContainText("Revision R2 is awaiting review");

  // Find the draft file URL (for the permissions test)
  await admin.goto(`/admin/documents/${docId}?tab=revisions`);
  const draftRow = admin.getByTestId("revision-row").filter({ hasText: "Awaiting review" });
  draftR2Url = (await draftRow.getByRole("link", { name: /Download R2/ }).getAttribute("href"))!;

  // Dealer still sees R1 and downloads the original R1 file
  const dealer = await login(browser, DEALER);
  await openPortalDoc(dealer, "TEC-26-049");
  await expect(dealer.getByText("Revision R1").first()).toBeVisible();
  let dl = await downloadFrom(dealer, "download-pdf");
  expect(sha(dl.body)).toBe(sha(readFileSync(REF_PDF)));

  // Dealer cannot fetch the draft file even with its URL
  const draftResp = await dealer.request.get(draftR2Url.replace("?download=1", ""));
  expect(draftResp.status()).toBe(404);

  // Approve & publish
  await admin.goto(`/admin/documents/${docId}`);
  await admin.getByTestId("pending-banner").getByTestId("publish-revision").click();
  await admin.getByTestId("confirm-publish").click();
  await expect(admin.getByTestId("pending-banner")).toHaveCount(0);

  // Dealer now sees UPDATED + R2, and downloads R2
  await openPortalDoc(dealer, "TEC-26-049");
  await expect(dealer.getByText("Revision R2").first()).toBeVisible();
  await expect(dealer.locator('[data-label="UPDATED"]').first()).toBeVisible();
  dl = await downloadFrom(dealer, "download-pdf");
  expect(sha(dl.body)).toBe(sha(readFileSync("e2e/fixtures/TEST-049-R2.pdf")));
  await dealer.goto("/portal/updates");
  await expect(dealer.getByText("UPDATED").first()).toBeVisible();

  // Scenario F — both revisions recorded, current clearly identified, previous still viewable
  await admin.goto(`/admin/documents/${docId}?tab=revisions`);
  const rows = admin.getByTestId("revision-row");
  await expect(rows).toHaveCount(2);
  // Newest first: R2 is current, R1 is kept as a previous revision
  await expect(rows.nth(0).locator("td").first()).toHaveText("R2");
  await expect(rows.nth(0)).toContainText("Current");
  await expect(rows.nth(1).locator("td").first()).toHaveText("R1");
  await expect(rows.nth(1)).toContainText("Previous");
  const r1Href = await rows.nth(1).getByRole("link", { name: "Download R1" }).getAttribute("href");
  const r1 = await admin.request.get(r1Href!);
  expect(sha(await r1.body())).toBe(sha(readFileSync(REF_PDF)));
  // Dealers cannot fetch the superseded R1 file
  const r1Dealer = await dealer.request.get(r1Href!);
  expect(r1Dealer.status()).toBe(404);
});

test("Scenario E — dealers cannot reach admin pages, upload, or see restricted / unpublished documents", async ({ browser }) => {
  const dealer = await login(browser, DEALER);
  const res = await dealer.goto("/admin");
  expect(res?.status()).toBe(403);
  await expect(dealer.getByText("Access restricted")).toBeVisible();
  const up = await dealer.request.post("/api/admin/uploads", {
    headers: { Origin: "http://localhost:3100" },
    multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: readFileSync("e2e/fixtures/TEST-NEW-DOC.pdf") } },
  });
  expect(up.status()).toBe(403);

  // Restrict TEC-26-045 to Middle East dealers
  const admin = await login(browser, ADMIN);
  const id = await openAdminDoc(admin, "TEC-26-045");
  await admin.goto(`/admin/documents/${id}?tab=metadata`);
  await admin.getByLabel("Only dealers in selected regions").check();
  await admin.getByLabel("Middle East").check();
  await admin.getByTestId("save-metadata").click();
  await expect(admin.getByText("Metadata saved.")).toBeVisible();

  await dealer.goto("/portal/documents?q=TEC-26-045");
  await expect(dealer.getByTestId("document-row")).toHaveCount(0);
  const direct = await dealer.goto(`/portal/documents/${id}`);
  expect(direct?.status()).toBe(404);

  const dealerMe = await login(browser, DEALER_ME);
  await dealerMe.goto("/portal/documents?q=TEC-26-045");
  await expect(dealerMe.getByTestId("document-row")).toHaveCount(1);

  // Unauthenticated access to files is refused
  const anon = await browser.newContext();
  const anonResp = await anon.request.get(draftR2Url);
  expect(anonResp.status()).toBe(401);

  // Withdraw → disappears for dealers, notice shown in Latest Updates
  await admin.goto(`/admin/documents/${id}`);
  await admin.getByRole("button", { name: "Withdraw" }).click();
  await admin.getByRole("dialog").getByRole("textbox").fill("Superseded by HQ notice (test).");
  await admin.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
  await expect(admin.getByText("Document withdrawn.")).toBeVisible();
  await dealerMe.goto("/portal/documents?q=TEC-26-045");
  await expect(dealerMe.getByTestId("document-row")).toHaveCount(0);
  await dealerMe.goto("/portal/updates");
  await expect(dealerMe.getByText("WITHDRAWN").first()).toBeVisible();
});

test("OCR makes a scanned PDF searchable without modifying the original", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await login(browser, ADMIN);
  await admin.goto("/admin/upload");
  await admin.getByTestId("mode-new").click();
  await admin.getByTestId("file-input").setInputFiles("e2e/fixtures/TEST-SCANNED.pdf");
  await expect(admin.getByText("This PDF looks scanned")).toBeVisible();
  await admin.getByLabel("Document title").fill("Scanned Test Document");
  await admin.getByLabel("Document number").fill("TEST-SCAN-001");
  await admin.locator("#categoryId").selectOption({ label: "Laboratory" });
  await admin.getByTestId("publish-now").click();
  await admin.waitForURL(/created=published/);
  await admin.getByRole("button", { name: "Run OCR" }).click();
  await expect(admin.getByText(/OCR started/)).toBeVisible();
  await expect
    .poll(
      async () => {
        await admin.goto("/admin/documents?q=QX7781234");
        return admin.getByTestId("admin-document-row").count();
      },
      { timeout: 180_000, intervals: [3000] },
    )
    .toBe(1);
  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal/documents?q=QX7781234");
  await expect(dealer.getByTestId("document-row")).toHaveCount(1);
  const { body } = await (async () => {
    await openPortalDoc(dealer, "TEST-SCAN-001");
    return downloadFrom(dealer, "download-pdf");
  })();
  expect(sha(body)).toBe(sha(readFileSync("e2e/fixtures/TEST-SCANNED.pdf")));
});

test("Rich-text authoring — create, add a table, save draft, publish with PDF export; dealer can open it", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = await login(browser, ADMIN);
  await admin.goto("/admin/authored/new");
  await admin.getByLabel("Document title").fill("SAMPLE Authored Bulletin (test)");
  await admin.getByLabel("Document number").fill("TEST-AUTH-001");
  await admin.locator("#categoryId").selectOption({ label: "General Technical Information" });
  const editor = admin.getByTestId("rich-editor");
  await editor.click();
  await admin.keyboard.type("Authored content marker AUTHMARK42.");
  await admin.getByRole("button", { name: "Insert table" }).click();
  await admin.keyboard.type("Model");
  await expect(editor.locator("table")).toBeVisible();
  await admin.getByTestId("save-authored").click();
  await admin.waitForURL(/\/admin\/authored\/[0-9a-f-]{36}\?saved=1/);
  const docId = admin.url().match(/authored\/([0-9a-f-]{36})/)![1];

  await admin.goto(`/admin/documents/${docId}`);
  await expect(admin.getByTestId("pending-banner")).toBeVisible();
  await admin.getByTestId("pending-banner").getByTestId("publish-revision").click();
  await admin.getByTestId("confirm-publish").click();
  await expect(admin.getByTestId("pending-banner")).toHaveCount(0, { timeout: 60_000 });

  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal/documents?q=AUTHMARK42");
  await expect(dealer.getByTestId("document-row")).toHaveCount(1);
  await dealer.goto(`/portal/documents/${docId}`);
  // With Chrome configured the authored document is exported to a real PDF on publish
  await expect(dealer.getByTestId("pdf-viewer").getByTestId("page-count")).toHaveText("/ 1");
  const { body } = await downloadFrom(dealer, "download-pdf");
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
});

test("Admin management — dealer account with forced password change, subcategory, restore previous revision", async ({ browser }) => {
  const admin = await login(browser, ADMIN);

  // New dealer account → one-time temporary password
  await admin.goto("/admin/dealers");
  await admin.getByTestId("new-dealer").click();
  const dlg = admin.getByRole("dialog");
  await dlg.getByLabel("Full name").fill("New Test Dealer");
  await dlg.getByLabel("E-mail address").fill("new.dealer@sample-dealer.test");
  await dlg.getByLabel("Dealer company").fill("SAMPLE New Dealer Co. (test)");
  await dlg.getByLabel("Region").selectOption({ label: "Southeast Asia" });
  await dlg.getByTestId("save-user").click();
  const temp = (await admin.getByTestId("temp-password").textContent())!.trim();
  expect(temp.length).toBeGreaterThan(10);

  // First sign-in forces a password change
  const ctx = await browser.newContext();
  const d = await ctx.newPage();
  await d.goto("/login");
  await d.getByLabel("E-mail address").fill("new.dealer@sample-dealer.test");
  await d.getByLabel("Password").fill(temp);
  await d.getByRole("button", { name: "Sign in" }).click();
  await d.waitForURL(/\/account\/password\?required=1/);
  await d.goto("/portal");
  await d.waitForURL(/\/account\/password/);
  await d.getByLabel("Current password").fill(temp);
  await d.getByLabel("New password", { exact: true }).fill("Brand-New-Pass-2026!");
  await d.getByLabel("Confirm new password").fill("Brand-New-Pass-2026!");
  await d.getByRole("button", { name: "Update password" }).click();
  await d.waitForURL(/\/portal\/account\?pw=1/);
  await expect(d.getByText("Your password has been changed.")).toBeVisible();

  // Subcategory added without code changes, visible to dealers
  await admin.goto("/admin/categories");
  const block = admin.getByTestId("category-block").filter({ hasText: "Ultrasonic Scalers" });
  await block.getByRole("button", { name: "Add subcategory" }).click();
  await admin.getByRole("dialog").getByLabel("Name").fill("Varios Scaler Tips (test)");
  await admin.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(block).toContainText("Varios Scaler Tips (test)");
  await d.goto("/portal/categories");
  await expect(d.getByText("Varios Scaler Tips (test)")).toBeVisible();

  // Restore R1 of TEC-26-049 as a new draft (nothing overwritten)
  const id = await openAdminDoc(admin, "TEC-26-049");
  await admin.goto(`/admin/documents/${id}?tab=revisions`);
  await admin.getByTestId("revision-row").nth(1).getByRole("button", { name: "Restore" }).click();
  const rd = admin.getByRole("dialog");
  await expect(rd.getByLabel("Revision number for the restored copy")).toHaveValue("R3");
  await rd.getByLabel("Reason (required)").fill("Test restore of R1.");
  await rd.getByRole("button", { name: "Create restored draft" }).click();
  await expect(admin.getByTestId("revision-row")).toHaveCount(3);
  await expect(admin.getByTestId("revision-row").nth(0)).toContainText("Awaiting review");
  await expect(admin.getByTestId("revision-row").nth(0)).toContainText("Restored copy");
  // Dealers still see R2 until the restored draft is published
  await openPortalDoc(d, "TEC-26-049");
  await expect(d.getByText("Revision R2").first()).toBeVisible();
});

test("Dealer notifications — bell lists recent publications and clears its unread count once read", async ({ browser }) => {
  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal");
  const bell = dealer.getByTestId("notification-bell");
  await expect(bell).toHaveAccessibleName(/unread/);
  await bell.click();
  const panel = dealer.getByRole("menu");
  await expect(panel).toContainText("E2E Test Document For Upload");
  await expect(panel.getByRole("menuitem", { name: "View all updates" })).toBeVisible();
  await dealer.keyboard.press("Escape");
  await expect(bell).toHaveAccessibleName("Notifications");
  // The read state is stored on the server, not just in the page.
  await expect
    .poll(async () => {
      await dealer.reload();
      return dealer.getByTestId("notification-bell").getAttribute("aria-label");
    })
    .toBe("Notifications");
});

test("Product model filter narrows results and shows a removable filter chip", async ({ browser }) => {
  const dealer = await login(browser, DEALER);
  await dealer.goto("/portal/documents");
  await dealer.getByTestId("filter-model").selectOption({ label: "Z-SG45L" });
  await expect(dealer.getByTestId("result-count")).toHaveText(/^1 document/);
  await expect(dealer.getByTestId("document-row")).toContainText("TEC-26-056");
  await dealer.getByRole("link", { name: "Remove filter: Model Z-SG45L" }).click();
  await expect(dealer.getByTestId("result-count")).not.toHaveText(/^1 document/);
});
