"use client";

import { useRef, useState } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  LoaderCircle,
  Minus,
  Pilcrow,
  Redo2,
  Rows2,
  SeparatorHorizontal,
  Table as TableIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { baseExtensions, Figure } from "@/lib/editor/extensions";
import { cn } from "@/lib/utils";

/* ---------------- Figure node view: resize, align, caption ---------------- */

function FigureView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const { src, alt, caption, width, align } = node.attrs as { src: string; alt: string; caption: string; width: number; align: string };
  const boxRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = boxRef.current?.parentElement;
    if (!box) return;
    const total = box.getBoundingClientRect().width;
    const startX = e.clientX;
    const startW = Number(width) || 100;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / total) * 100 * (align === "center" ? 2 : align === "right" ? -1 : 1);
      updateAttributes({ width: Math.round(Math.min(100, Math.max(10, startW + dx))) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const btn = (active: boolean) =>
    cn("rounded p-1 cursor-pointer [&_svg]:size-3.5", active ? "bg-navy text-white" : "hover:bg-grey-50");
  return (
    <NodeViewWrapper as="figure" data-figure="" data-align={align} className="!my-4 flex flex-col">
      <div
        ref={boxRef}
        className={cn("relative", selected && "outline-2 outline-ring outline-offset-2 rounded-sm")}
        style={{ width: `${width}%`, alignSelf: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block w-full" draggable={false} />
        {selected && (
          <>
            <span
              onPointerDown={startDrag}
              className="absolute -right-1.5 top-1/2 h-10 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-ring shadow"
              title="Drag to resize"
            />
            <div className="absolute -top-10 left-0 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-md" contentEditable={false}>
              <button type="button" className={btn(align === "left")} onClick={() => updateAttributes({ align: "left" })} aria-label="Align left">
                <AlignLeft />
              </button>
              <button type="button" className={btn(align === "center")} onClick={() => updateAttributes({ align: "center" })} aria-label="Align centre">
                <AlignCenter />
              </button>
              <button type="button" className={btn(align === "right")} onClick={() => updateAttributes({ align: "right" })} aria-label="Align right">
                <AlignRight />
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              {[25, 50, 75, 100].map((w) => (
                <button key={w} type="button" className={cn(btn(Number(width) === w), "px-1.5 text-[11px]")} onClick={() => updateAttributes({ width: w })}>
                  {w}%
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-border" />
              <button type="button" className={btn(false)} onClick={deleteNode} aria-label="Remove image">
                <Trash2 />
              </button>
            </div>
          </>
        )}
      </div>
      <input
        value={caption}
        onChange={(e) => updateAttributes({ caption: e.target.value })}
        placeholder="Add a caption (optional)"
        className="mt-1 border-0 bg-transparent p-0 text-[13px] text-muted outline-none placeholder:text-subtle"
        style={{ width: `${width}%`, alignSelf: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}
      />
    </NodeViewWrapper>
  );
}

const EditableFigure = Figure.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

/* ---------------- Toolbar ---------------- */

function ToolButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-[12px] cursor-pointer disabled:opacity-35 disabled:pointer-events-none [&_svg]:size-4",
        active ? "bg-navy text-white" : "hover:bg-grey-50",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onImage, uploading }: { editor: Editor; onImage: () => void; uploading: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      p: e.isActive("paragraph"),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const sep = <span className="mx-1 h-5 w-px bg-border" />;
  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-0.5 border-b border-border bg-surface/95 px-2 py-1.5 backdrop-blur">
      <ToolButton label="Undo" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 />
      </ToolButton>
      <ToolButton label="Redo" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 />
      </ToolButton>
      {sep}
      <ToolButton label="Paragraph" active={s.p} onClick={() => chain().setParagraph().run()}>
        <Pilcrow />
      </ToolButton>
      <ToolButton label="Heading 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 />
      </ToolButton>
      <ToolButton label="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolButton>
      <ToolButton label="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolButton>
      {sep}
      <ToolButton label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton
        label="Link"
        active={s.link}
        onClick={() => {
          if (s.link) return void chain().unsetLink().run();
          const url = window.prompt("Link URL (https://…)");
          if (!url) return;
          if (!/^(https?:\/\/|mailto:)/i.test(url)) return void toast.error("Use an https:// or mailto: link.");
          chain().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <LinkIcon />
      </ToolButton>
      {sep}
      <ToolButton label="Align left" active={s.left} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeft />
      </ToolButton>
      <ToolButton label="Align centre" active={s.center} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenter />
      </ToolButton>
      <ToolButton label="Align right" active={s.right} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRight />
      </ToolButton>
      {sep}
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      {sep}
      <ToolButton label="Insert table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon />
      </ToolButton>
      {s.table && (
        <>
          <ToolButton label="Add row below" onClick={() => chain().addRowAfter().run()}>
            <Rows2 /> +
          </ToolButton>
          <ToolButton label="Add column right" onClick={() => chain().addColumnAfter().run()}>
            <Columns2 /> +
          </ToolButton>
          <ToolButton label="Delete row" onClick={() => chain().deleteRow().run()}>
            <Rows2 /> −
          </ToolButton>
          <ToolButton label="Delete column" onClick={() => chain().deleteColumn().run()}>
            <Columns2 /> −
          </ToolButton>
          <ToolButton label="Merge or split cells" onClick={() => chain().mergeOrSplit().run()}>
            Merge
          </ToolButton>
          <ToolButton label="Toggle header row" onClick={() => chain().toggleHeaderRow().run()}>
            Header
          </ToolButton>
          <ToolButton label="Delete table" onClick={() => chain().deleteTable().run()}>
            <Trash2 />
          </ToolButton>
        </>
      )}
      {sep}
      <ToolButton label="Insert image" onClick={onImage} disabled={uploading}>
        {uploading ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}
      </ToolButton>
      <ToolButton label="Horizontal rule" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </ToolButton>
      <ToolButton label="Page break" onClick={() => chain().insertContent({ type: "pageBreak" }).run()}>
        <SeparatorHorizontal />
      </ToolButton>
    </div>
  );
}

/* ---------------- Editor ---------------- */

export function RichTextEditor({
  initialContent,
  documentId,
  onChange,
}: {
  initialContent?: unknown;
  documentId?: string;
  onChange: (json: unknown) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...baseExtensions().filter((e) => e.name !== "figure"),
      EditableFigure,
      Placeholder.configure({ placeholder: "Start writing the technical information…" }),
    ],
    content: (initialContent as object) ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: { attributes: { class: "doc-prose", "data-testid": "rich-editor" } },
    onCreate: ({ editor: e }) => onChange(e.getJSON()),
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });

  async function uploadImage(file: File) {
    if (!editor) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (documentId) fd.append("documentId", documentId);
      const res = await fetch("/api/admin/assets", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      editor.chain().focus().insertContent({ type: "figure", attrs: { src: body.url, alt: file.name, width: 80, align: "center" } }).run();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-xs">
      {editor && <Toolbar editor={editor} uploading={uploading} onImage={() => fileRef.current?.click()} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />
      <div className="mx-auto max-w-[210mm] px-6 py-8 sm:px-12">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
