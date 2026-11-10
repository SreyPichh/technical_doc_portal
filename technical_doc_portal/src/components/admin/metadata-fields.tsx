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

const ADD_NEW = "__new__";
const NEW_NAME_FIELD = { documentTypeId: "newDocumentType", categoryId: "newCategory", subcategoryId: "newSubcategory" } as const;

/**
 * A drop-down of existing entries plus "+ Add a new …". Choosing it shows a name field; the entry is
 * created when the form is saved (an existing entry with the same name is re-used instead).
 */
function SelectOrAdd({
  id,
  label,
  noun,
  options,
  value,
  onChange,
  placeholder,
  example,
  plural = `${noun}s`,
  required = true,
  disabled = false,
}: {
  id: keyof typeof NEW_NAME_FIELD;
  label: string;
  noun: string;
  plural?: string;
  options: (Opt & { suffix?: string })[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  example: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const newId = NEW_NAME_FIELD[id];
  const [name, setName] = useState("");
  // A required list with nothing in it goes straight to "add new".
  const adding = !disabled && (value === ADD_NEW || (required && !options.length));
  const match = options.find((o) => o.name.toLowerCase() === name.replace(/\s+/g, " ").trim().toLowerCase());
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} required={required} htmlFor={id}>
        <Select id={id} name={id} value={adding ? ADD_NEW : value} onChange={(e) => onChange(e.target.value)} required={required} disabled={disabled}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.suffix}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add a new {noun}…</option>
        </Select>
      </Field>
      {adding && (
        <Field
          label={`New ${noun}`}
          required
          htmlFor={newId}
          hint={match ? `“${match.name}” already exists — it will be used.` : `Added to the list of ${plural} when you save.`}
        >
          <Input
            id={newId}
            name={newId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            autoFocus={options.length > 0 || !required}
            placeholder={`e.g. ${example}`}
          />
        </Field>
      )}
    </div>
  );
}

const BASE_LANGUAGES = ["English", "Japanese", "German", "French", "Spanish", "Chinese", "Korean"];

export function MetadataFields({ options, defaults = {} }: { options: MetadataOptions; defaults?: MetadataDefaults }) {
  const [categoryId, setCategoryId] = useState(defaults.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(defaults.subcategoryId ?? "");
  const [typeId, setTypeId] = useState(defaults.documentTypeId ?? options.types[0]?.id ?? "");
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
      <SelectOrAdd id="documentTypeId" label="Document type" noun="type" options={options.types} value={typeId} onChange={setTypeId} example="Design Change" />
      <SelectOrAdd
        id="categoryId"
        label="Category"
        noun="category"
        options={options.categories.map((c) => ({ id: c.id, name: c.name, suffix: c.status === "inactive" ? " (inactive)" : "" }))}
        value={categoryId}
        onChange={(v) => {
          setCategoryId(v);
          setSubcategoryId("");
        }}
        placeholder="Choose a category…"
        example="Endodontics"
        plural="categories"
      />
      <SelectOrAdd
        key={categoryId}
        id="subcategoryId"
        label="Subcategory / product series"
        noun="subcategory"
        plural="subcategories"
        required={false}
        disabled={!categoryId}
        options={subs.map((c) => ({ id: c.id, name: c.name, suffix: c.status === "inactive" ? " (inactive)" : "" }))}
        value={subcategoryId}
        onChange={setSubcategoryId}
        placeholder={categoryId ? "None" : "Choose a category first"}
        example="Surgic Pro2"
      />
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
