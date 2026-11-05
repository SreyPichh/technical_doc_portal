/**
 * Development / demo seed.
 *
 *   npm run db:seed            # seeds an empty database
 *   npm run db:seed -- --reset # wipes ALL data and files first (development only)
 *
 * Seeds: categories, document types, sample regions, a test administrator and
 * two clearly-marked sample dealer accounts, and the official sample PDFs found
 * in ./doc_sample (ingested unchanged through the normal analysis pipeline).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const RESET = process.argv.includes("--reset");

async function main() {
  const { db, schema } = await import("@/server/db");
  const { sql, eq } = await import("drizzle-orm");
  const { hashPassword } = await import("@/server/auth/password");
  const { analyzePdf } = await import("@/server/pdf/analyze");
  const { storage, newKey } = await import("@/server/storage");
  const { rebuildSearchText } = await import("@/server/services/documents");
  const { env } = await import("@/server/env");
  const { slugify } = await import("@/lib/text");

  if (RESET) {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production.");
    console.log("Resetting database and local storage…");
    await db.execute(sql`alter table activity_logs disable trigger activity_logs_append_only`);
    await db.execute(sql`alter table document_revisions disable trigger document_revisions_guard_delete`);
    await db.execute(sql`truncate table activity_logs, notifications, downloads, saved_documents, assets, uploads,
      document_regions, sessions, login_attempts, settings restart identity cascade`);
    await db.execute(sql`update documents set current_revision_id = null`);
    await db.execute(sql`delete from document_revisions`);
    await db.execute(sql`delete from documents`);
    await db.execute(sql`delete from categories where parent_category_id is not null`);
    await db.execute(sql`delete from categories`);
    await db.execute(sql`delete from document_types`);
    await db.execute(sql`delete from users`);
    await db.execute(sql`delete from regions`);
    await db.execute(sql`alter table activity_logs enable trigger activity_logs_append_only`);
    await db.execute(sql`alter table document_revisions enable trigger document_revisions_guard_delete`);
    if (env.STORAGE_DRIVER === "local") {
      for (const dir of ["uploads", "revisions", "assets"]) {
        await rm(path.resolve(env.STORAGE_LOCAL_DIR, dir), { recursive: true, force: true });
      }
    }
  } else {
    const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (existing.length) {
      console.log("Database already contains data — skipping seed. Use --reset to start over (development only).");
      process.exit(0);
    }
  }

  /* -------- Regions (sample) -------- */
  const regionNames = [
    ["Southeast Asia", "SEA"],
    ["South Asia", "SA"],
    ["Middle East", "ME"],
    ["Oceania", "OC"],
  ] as const;
  const regions = await db
    .insert(schema.regions)
    .values(regionNames.map(([name, code]) => ({ name, code })))
    .returning();
  const regionId = (code: string) => regions.find((r) => r.code === code)!.id;

  /* -------- Document types -------- */
  const types = await db
    .insert(schema.documentTypes)
    .values(
      [
        "Technical Information",
        "Service Manual",
        "Specification",
        "Operation Manual",
        "Parts List",
        "Product Notice",
        "Training Material",
      ].map((name, i) => ({ name, displayOrder: i })),
    )
    .returning();
  const typeId = (name: string) => types.find((t) => t.name === name)!.id;

  /* -------- Categories -------- */
  const tree: [string, string, string, string[]][] = [
    ["Air Turbine", "wind", "High-speed air turbine handpieces.", ["S-Max Series", "Ti-Max Series", "Z Series", "Other Air Turbines"]],
    ["Contra Angle & Straight Handpieces", "drill", "Contra-angle and straight handpieces.", []],
    ["Oral Health", "smile", "Preventive and oral hygiene products.", ["Varios Series", "Prophy-Mate", "iCare", "Other Oral Health Products"]],
    ["Ultrasonic Scalers", "waves", "Ultrasonic scaler units, handpieces and tips.", []],
    ["Surgical & Implant", "syringe", "Surgical motors and implant handpieces.", []],
    ["Laboratory", "flask", "Laboratory micromotors and equipment.", []],
    ["General Technical Information", "info", "Information that applies across product lines (labelling, regulatory, etc.).", []],
  ];
  const cats: Record<string, string> = {};
  for (const [i, [name, icon, description, children]] of tree.entries()) {
    const [c] = await db
      .insert(schema.categories)
      .values({ name, slug: slugify(name), icon, description, displayOrder: i })
      .returning();
    cats[name] = c.id;
    for (const [j, child] of children.entries()) {
      const [s] = await db
        .insert(schema.categories)
        .values({ name: child, slug: slugify(`${name}-${child}`), parentId: c.id, displayOrder: j })
        .returning();
      cats[`${name}/${child}`] = s.id;
    }
  }

  /* -------- Users (TEST ACCOUNTS — development only) -------- */
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@nsk-portal.test";
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  const dealerEmail = process.env.SEED_DEALER_EMAIL ?? "dealer@sample-dealer.test";
  const dealerPw = process.env.SEED_DEALER_PASSWORD;
  if (!adminPw || !dealerPw) throw new Error("Set SEED_ADMIN_PASSWORD and SEED_DEALER_PASSWORD (see .env.example).");

  const [admin] = await db
    .insert(schema.users)
    .values({
      fullName: "Portal Administrator",
      email: adminEmail,
      passwordHash: await hashPassword(adminPw),
      role: "super_admin",
      mustChangePassword: false,
    })
    .returning();
  await db.insert(schema.users).values([
    {
      fullName: "Sample Dealer User",
      email: dealerEmail,
      passwordHash: await hashPassword(dealerPw),
      role: "dealer",
      dealerName: "SAMPLE Dental Supply Co. (demo)",
      regionId: regionId("SEA"),
      mustChangePassword: false,
      createdBy: admin.id,
    },
    {
      fullName: "Second Sample Dealer",
      email: "dealer2@sample-dealer.test",
      passwordHash: await hashPassword(dealerPw),
      role: "dealer",
      dealerName: "SAMPLE Middle East Distributor (demo)",
      regionId: regionId("ME"),
      mustChangePassword: false,
      createdBy: admin.id,
    },
  ]);

  /* -------- Official sample documents from ./doc_sample -------- */
  type SeedDoc = {
    file: string;
    title: string;
    number: string;
    revision: string;
    releaseDate: string;
    category: string;
    models: string[];
    description: string;
    /** Days before "now" that the document was published on the portal (demo timeline). */
    publishedDaysAgo: number;
  };
  const docs: SeedDoc[] = [
    {
      file: "Technical_Information_TEC-26-044_EN.pdf",
      title: "Model/Product Name Change to CR-2",
      number: "TEC-26-044",
      revision: "R0",
      releaseDate: "2026-08-06",
      category: "General Technical Information",
      models: ["CR-2", "S900"],
      description:
        "The model/product name S900/Tip Holder changes to CR-2, with label and marking updated for EU MDR 2017/745 (Class I).",
      publishedDaysAgo: 88,
    },
    {
      file: "Technical_Information_TEC-26-045_EN.pdf",
      title: "Labeling and Packaging Change of Carbon Brush",
      number: "TEC-26-045",
      revision: "R0",
      releaseDate: "2026-08-07",
      category: "General Technical Information",
      models: ["Carbon Brush (2pcs/set)", "E023011S"],
      description: "A barcode label is added to the package and the plastic case is enclosed in a plastic bag.",
      publishedDaysAgo: 87,
    },
    {
      file: "Technical_Information_TEC-26-056_EN.pdf",
      title: "Notice of Design Change and Repair for Z-SG45L",
      number: "TEC-26-056",
      revision: "R0",
      releaseDate: "2026-09-14",
      category: "Surgical & Implant",
      models: ["Z-SG45L", "C1107022"],
      description:
        "An identification groove is added to the gear portion of the Z-SG45L drive shaft (C1107022) to prevent mix-ups with the Z45L drive shaft (C1064022).",
      publishedDaysAgo: 50,
    },
    {
      file: "Technical_Information_TEC-26-049_EN-R1.pdf",
      title: "Labeling Change of Dental Products (MDR)",
      number: "TEC-26-049",
      revision: "R1",
      releaseDate: "2026-10-05",
      category: "General Technical Information",
      models: ["Internal Spray Nozzle", "NLS-A ADP", "NLZ CD", "VA-SC", "iSD230VE1"],
      description:
        "Labelling of the listed NSK dental products changes to comply with the EU Medical Device Regulation (MDR): new or combined labels and updated rating plates. Includes the product list with order codes, UDI-DI and shipping dates.",
      publishedDaysAgo: 0,
    },
  ];

  const technicalInfo = typeId("Technical Information");
  for (const sd of docs) {
    const filePath = path.resolve("doc_sample", sd.file);
    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      console.warn(`  ! ${sd.file} not found in ./doc_sample — skipped`);
      continue;
    }
    const a = await analyzePdf(buf);
    const key = newKey("revisions", "pdf");
    await storage.put(key, buf, "application/pdf");
    const publishedAt = new Date(Date.now() - sd.publishedDaysAgo * 86_400_000);
    await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(schema.documents)
        .values({
          title: sd.title,
          documentNumber: sd.number,
          description: sd.description,
          categoryId: cats[sd.category],
          productModels: sd.models,
          documentTypeId: technicalInfo,
          language: "English",
          source: "NSK HQ",
          status: "draft",
          createdBy: admin.id,
          createdAt: publishedAt,
        })
        .returning();
      const [rev] = await tx
        .insert(schema.documentRevisions)
        .values({
          documentId: doc.id,
          revisionNumber: sd.revision,
          sequence: 1,
          releaseDate: sd.releaseDate,
          fileKey: key,
          originalFilename: sd.file,
          fileSize: buf.length,
          mimeType: "application/pdf",
          sha256: a.sha256,
          pageCount: a.pageCount,
          extractedText: a.text,
          textSource: a.textChars ? "pdf" : "none",
          ocrStatus: a.likelyScanned ? "recommended" : "not_needed",
          uploadedBy: admin.id,
          uploadedAt: publishedAt,
          approvalStatus: "published",
          approvedBy: admin.id,
          publishedAt,
          revisionNotes: "Initial upload of the official HQ document (seed data).",
        })
        .returning();
      await tx
        .update(schema.documents)
        .set({
          currentRevisionId: rev.id,
          status: "published",
          firstPublishedAt: publishedAt,
          lastPublishedAt: publishedAt,
          lastPublishEvent: "new",
          statusChangedAt: publishedAt,
          updatedAt: publishedAt,
        })
        .where(eq(schema.documents.id, doc.id));
      await rebuildSearchText(tx, doc.id);
      await tx.insert(schema.notifications).values({
        documentId: doc.id,
        revisionId: rev.id,
        type: "new",
        title: `${sd.number} — ${sd.title}`,
        message: `New technical information published (Revision ${sd.revision}).`,
        createdBy: admin.id,
        createdAt: publishedAt,
      });
      await tx.insert(schema.activityLogs).values({
        userId: admin.id,
        action: "revision.published",
        documentId: doc.id,
        description: `Published ${sd.number} ${sd.revision} (seed data)`,
        createdAt: publishedAt,
      });
    });
    console.log(`  ✓ ${sd.number} ${sd.revision} — ${a.pageCount} page(s), ${a.textChars} text characters indexed`);
  }

  console.log("\n✓ Seed complete.");
  console.log(`  Administrator: ${adminEmail}  (password from SEED_ADMIN_PASSWORD)`);
  console.log(`  Sample dealer: ${dealerEmail} (Southeast Asia), dealer2@sample-dealer.test (Middle East)`);
  console.log("  Sample dealers share SEED_DEALER_PASSWORD. Change or remove these accounts before going live.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
