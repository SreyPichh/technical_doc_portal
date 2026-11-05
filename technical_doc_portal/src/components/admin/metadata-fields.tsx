"use client";

import { useState } from "react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";

type Opt = { id: string; name: string };
export type MetadataOptions = {
  categories: (Opt & { status?: string; children: (Opt & { status?: string })[] })[];
  types: Opt[];
  regions: Opt[];
  languages: string[];
};

export type MetadataDefaults = {
  title?: string;
  documentNumber?: string;
  description?: string | null;
  categoryId?: string;
  subcategoryId?: string | null;
  productModels?: string[];
  documentTypeId?: string;
  language?: string;
  source?: string;
  visibility?: "all_dealers" | "regions";
  regionIds?: string[];
};

const BASE_LANGUAGES = ["English", "Japanese", "German", "French", "Spanish", "Chinese", "Korean"];

export function MetadataFields({ options, defaults = {} }: { options: MetadataOptions; defaults?: MetadataDefaults }) {
  const [categoryId, setCategoryId] = useState(defaults.categoryId ?? "");
  const [visibility, setVisibility] = useState(defaults.visibility ?? "all_dealers");
  const subs = options.categories.find((c) => c.id === categoryId)?.children ?? [];
  const languages = [...new Set([...BASE_LANGUAGES, ...options.languages])];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Document title" required htmlFor="title" className="md:col-span-2">
        <Input id="title" name="title" defaultValue={defaults.title} required maxLength={300} placeholder="Official document title" />
      </Field>
      <Field label="Document number" required htmlFor="documentNumber" hint="Without language/revision suffix, e.g. TEC-26-049">
        <Input id="documentNumber" name="documentNumber" defaultValue={defaults.documentNumber} required maxLength={60} className="font-mono" />
      </Field>
      <Field label="Document type" required htmlFor="documentTypeId">
        <Select id="documentTypeId" name="documentTypeId" defaultValue={defaults.documentTypeId ?? options.types[0]?.id} required>
          {options.types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Category" required htmlFor="categoryId">
        <Select
          id="categoryId"
          name="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
        >
          <option value="">Choose a category…</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.status === "inactive" ? " (inactive)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subcategory / product series" htmlFor="subcategoryId">
        <Select id="subcategoryId" name="subcategoryId" defaultValue={defaults.subcategoryId ?? ""} key={categoryId} disabled={!subs.length}>
          <option value="">{subs.length ? "None" : "No series in this category"}</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === "inactive" ? " (inactive)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Product models" htmlFor="productModels" hint="Comma-separated. Used for search and shown to dealers." className="md:col-span-2">
        <Input id="productModels" name="productModels" defaultValue={defaults.productModels?.join(", ")} placeholder="e.g. Z-SG45L, C1107022" />
      </Field>
      <Field label="Language" required htmlFor="language">
        <Input id="language" name="language" list="languages" defaultValue={defaults.language ?? "English"} required />
        <datalist id="languages">
          {languages.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Field>
      <Field label="Source" required htmlFor="source">
        <Input id="source" name="source" defaultValue={defaults.source ?? "NSK HQ"} required />
      </Field>
      <Field label="Short description" htmlFor="description" className="md:col-span-2" hint="A one- or two-sentence summary shown to dealers.">
        <Textarea id="description" name="description" defaultValue={defaults.description ?? ""} rows={3} maxLength={2000} />
      </Field>
      <fieldset className="md:col-span-2 rounded-md border border-border p-3">
        <legend className="px-1 text-[13px] font-medium">Dealer access</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="all_dealers" checked={visibility === "all_dealers"} onChange={() => setVisibility("all_dealers")} className="accent-navy" />
            All dealers
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="regions" checked={visibility === "regions"} onChange={() => setVisibility("regions")} className="accent-navy" />
            Only dealers in selected regions
          </label>
        </div>
        {visibility === "regions" && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {options.regions.map((r) => (
              <label key={r.id} className="flex items-center gap-2">
                <Checkbox name="regionIds" value={r.id} defaultChecked={defaults.regionIds?.includes(r.id)} />
                {r.name}
              </label>
            ))}
            {!options.regions.length && <p className="text-muted">No regions defined yet — add them in Settings.</p>}
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function RevisionFields({
  defaults = {},
  numberHint,
}: {
  defaults?: { revisionNumber?: string; releaseDate?: string | null; revisionNotes?: string | null };
  numberHint?: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Revision number" required htmlFor="revisionNumber" hint={numberHint ?? "As printed on the HQ document, e.g. R1"}>
        <Input id="revisionNumber" name="revisionNumber" defaultValue={defaults.revisionNumber} required maxLength={30} className="font-mono" />
      </Field>
      <Field label="Release date" htmlFor="releaseDate" hint="Official issue date on the document">
        <Input id="releaseDate" name="releaseDate" type="date" defaultValue={defaults.releaseDate ?? ""} />
      </Field>
      <Field label="Revision notes" htmlFor="revisionNotes" className="md:col-span-2" hint="What changed in this revision (internal; kept in the history).">
        <Textarea id="revisionNotes" name="revisionNotes" defaultValue={defaults.revisionNotes ?? ""} rows={2} maxLength={2000} />
      </Field>
    </div>
  );
}
