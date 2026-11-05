import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/**
 * Roles. Only super_admin, admin and dealer are used by the UI today; the
 * others are defined (with permission sets in src/lib/permissions.ts) so they
 * can be switched on later without a schema change.
 */
export const userRole = pgEnum("user_role", [
  "super_admin",
  "admin",
  "technical_reviewer",
  "regional_admin",
  "dealer_manager",
  "dealer",
]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const categoryStatus = pgEnum("category_status", ["active", "inactive"]);
export const documentStatus = pgEnum("document_status", [
  "draft",
  "published",
  "archived",
  "withdrawn",
]);
export const documentKind = pgEnum("document_kind", ["uploaded_pdf", "authored"]);
export const documentVisibility = pgEnum("document_visibility", ["all_dealers", "regions"]);
export const revisionStatus = pgEnum("revision_status", [
  "draft", // uploaded, awaiting review/approval
  "published", // the current dealer-facing revision (at most one per document)
  "superseded", // previously published, replaced by a newer published revision
  "rejected", // draft that was discarded during review (file kept for audit)
]);
export const publishEvent = pgEnum("publish_event", ["new", "updated"]);
export const textSource = pgEnum("text_source", ["pdf", "ocr", "authored", "none"]);
export const ocrStatus = pgEnum("ocr_status", ["not_needed", "recommended", "running", "done", "failed"]);
export const notificationType = pgEnum("notification_type", [
  "new",
  "updated",
  "withdrawn",
  "archived",
  "restored",
]);
export const emailStatus = pgEnum("email_status", [
  "disabled",
  "not_configured",
  "pending",
  "sent",
  "partial",
  "failed",
]);

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------------------------------------------ */
/* People & access                                                     */
/* ------------------------------------------------------------------ */

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("dealer"),
    dealerName: text("dealer_name"),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "set null" }),
    status: userStatus("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    emailNotifications: boolean("email_notifications").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) — the raw token only ever lives in the user's cookie */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Library structure                                                   */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    icon: text("icon"),
    parentId: uuid("parent_category_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    displayOrder: integer("display_order").notNull().default(0),
    status: categoryStatus("status").notNull().default("active"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_parent_name_idx").on(sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.name})`),
    index("categories_parent_idx").on(t.parentId, t.displayOrder),
  ],
);

export const documentTypes = pgTable("document_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/* ------------------------------------------------------------------ */
/* Documents & revisions                                               */
/* ------------------------------------------------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    documentNumber: text("document_number").notNull(),
    description: text("description"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    subcategoryId: uuid("subcategory_id").references(() => categories.id, { onDelete: "set null" }),
    productModels: text("product_models").array().notNull().default(sql`'{}'::text[]`),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    language: text("language").notNull().default("English"),
    source: text("source").notNull().default("NSK HQ"),
    kind: documentKind("kind").notNull().default("uploaded_pdf"),
    status: documentStatus("status").notNull().default("draft"),
    visibility: documentVisibility("visibility").notNull().default("all_dealers"),
    /** The approved revision dealers see. Null until first publication. */
    currentRevisionId: uuid("current_revision_id").references((): AnyPgColumn => documentRevisions.id, {
      onDelete: "restrict",
    }),
    /** Set by publication events only — drives NEW / UPDATED labels. */
    firstPublishedAt: ts("first_published_at"),
    lastPublishedAt: ts("last_published_at"),
    lastPublishEvent: publishEvent("last_publish_event"),
    statusChangedAt: ts("status_changed_at"),
    statusReason: text("status_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Denormalised, NFKC-normalised metadata + current published text. Maintained by the app. */
    searchText: text("search_text").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(search_text, ''))`,
    ),
  },
  (t) => [
    uniqueIndex("documents_number_lower_idx").on(sql`lower(${t.documentNumber})`),
    index("documents_category_idx").on(t.categoryId),
    index("documents_subcategory_idx").on(t.subcategoryId),
    index("documents_status_idx").on(t.status, t.lastPublishedAt),
    index("documents_search_vector_idx").using("gin", t.searchVector),
    index("documents_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const documentRegions = pgTable(
  "document_regions",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.regionId] })],
);

export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    revisionNumber: text("revision_number").notNull(),
    /** Monotonic order within a document (1, 2, 3…), independent of the label. */
    sequence: integer("sequence").notNull(),
    releaseDate: date("release_date", { mode: "string" }),
    fileKey: text("file_path"),
    originalFilename: text("original_filename"),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: text("mime_type"),
    sha256: text("sha256"),
    pageCount: integer("page_count"),
    extractedText: text("extracted_text"),
    textSource: textSource("text_source").notNull().default("none"),
    ocrStatus: ocrStatus("ocr_status").notNull().default("not_needed"),
    /** TipTap JSON for application-authored documents (kind = authored). */
    authoredContent: jsonb("authored_content"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
    approvalStatus: revisionStatus("approval_status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: ts("published_at"),
    supersededAt: ts("superseded_at"),
    revisionNotes: text("revision_notes"),
    restoredFromId: uuid("restored_from_id").references((): AnyPgColumn => documentRevisions.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("revisions_doc_number_idx").on(t.documentId, sql`lower(${t.revisionNumber})`),
    uniqueIndex("revisions_doc_seq_idx").on(t.documentId, t.sequence),
    /** At most one published revision per document. */
    uniqueIndex("revisions_one_published_idx")
      .on(t.documentId)
      .where(sql`approval_status = 'published'`),
    index("revisions_sha_idx").on(t.sha256),
  ],
);

/** A staged upload: file stored + analysed, not yet attached to a revision. */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileKey: text("file_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  pageCount: integer("page_count").notNull(),
  extractedText: text("extracted_text").notNull().default(""),
  textChars: integer("text_chars").notNull().default(0),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  consumedAt: ts("consumed_at"),
});

/** Images embedded in authored documents. Served only to users who may see the document. */
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Events, logs, dealer activity                                       */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    type: notificationType("notification_type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    emailStatus: emailStatus("email_status").notNull().default("disabled"),
    emailRecipients: integer("email_recipients").notNull().default(0),
    emailError: text("email_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_created_idx").on(t.createdAt),
    index("activity_document_idx").on(t.documentId),
    index("activity_action_idx").on(t.action),
  ],
);

export const downloads = pgTable(
  "downloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => documentRevisions.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("downloads_user_idx").on(t.userId, t.createdAt), index("downloads_doc_idx").on(t.documentId)],
);

export const savedDocuments = pgTable(
  "saved_documents",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.documentId] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Relations (for the relational query API)                            */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ one }) => ({
  region: one(regions, { fields: [users.regionId], references: [regions.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "tree" }),
  children: many(categories, { relationName: "tree" }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  category: one(categories, { fields: [documents.categoryId], references: [categories.id], relationName: "cat" }),
  subcategory: one(categories, {
    fields: [documents.subcategoryId],
    references: [categories.id],
    relationName: "subcat",
  }),
  documentType: one(documentTypes, { fields: [documents.documentTypeId], references: [documentTypes.id] }),
  currentRevision: one(documentRevisions, {
    fields: [documents.currentRevisionId],
    references: [documentRevisions.id],
    relationName: "current",
  }),
  revisions: many(documentRevisions, { relationName: "revisions" }),
  regions: many(documentRegions),
  creator: one(users, { fields: [documents.createdBy], references: [users.id] }),
}));

export const documentRegionsRelations = relations(documentRegions, ({ one }) => ({
  document: one(documents, { fields: [documentRegions.documentId], references: [documents.id] }),
  region: one(regions, { fields: [documentRegions.regionId], references: [regions.id] }),
}));

export const documentRevisionsRelations = relations(documentRevisions, ({ one }) => ({
  document: one(documents, {
    fields: [documentRevisions.documentId],
    references: [documents.id],
    relationName: "revisions",
  }),
  uploader: one(users, { fields: [documentRevisions.uploadedBy], references: [users.id], relationName: "uploader" }),
  approver: one(users, { fields: [documentRevisions.approvedBy], references: [users.id], relationName: "approver" }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
  document: one(documents, { fields: [activityLogs.documentId], references: [documents.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  document: one(documents, { fields: [notifications.documentId], references: [documents.id] }),
  revision: one(documentRevisions, { fields: [notifications.revisionId], references: [documentRevisions.id] }),
}));

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type DocumentStatus = (typeof documentStatus.enumValues)[number];
