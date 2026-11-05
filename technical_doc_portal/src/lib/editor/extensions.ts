import { mergeAttributes, Node, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";

/** Image with width, alignment and caption, rendered as <figure>. */
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: 100 }, // percent of the text column
      align: { default: "center" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-figure]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const img = e.querySelector("img");
          return {
            src: img?.getAttribute("src"),
            alt: img?.getAttribute("alt") ?? "",
            caption: e.querySelector("figcaption")?.textContent ?? "",
            width: Number(e.getAttribute("data-width")) || 100,
            align: e.getAttribute("data-align") ?? "center",
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const { src, alt, caption, width, align } = node.attrs as {
      src: string;
      alt: string;
      caption: string;
      width: number;
      align: string;
    };
    const w = Math.min(100, Math.max(10, Number(width) || 100));
    const children: unknown[] = [["img", { src, alt, style: `width:${w}%` }]];
    if (caption) children.push(["figcaption", { style: `width:${w}%` }, caption]);
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-figure": "", "data-align": align, "data-width": String(w) }),
      ...children,
    ] as never;
  },
});

/** Hard page break for print / PDF export. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: "hr[data-page-break]" }];
  },
  renderHTML() {
    return ["hr", { "data-page-break": "" }];
  },
});

export function baseExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TableKit.configure({ table: { resizable: true } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Figure,
    PageBreak,
  ];
}
