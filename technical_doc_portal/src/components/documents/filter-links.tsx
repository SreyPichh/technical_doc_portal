import Link from "next/link";

/**
 * Category and document type shown as links to the document list filtered by that value
 * (used in the "Document" / "Document information" panels).
 */
type Doc = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  documentTypeId: string;
  documentType: string;
};

const linkClass = "text-navy underline-offset-2 hover:underline focus-visible:underline";

/** `listPath` is the document list to filter: "/portal/documents" or "/admin/documents". */
export function CategoryLinks({ doc, listPath }: { doc: Doc; listPath: string }) {
  return (
    <>
      <Link href={`${listPath}?category=${doc.categoryId}`} className={linkClass} title={`All documents in ${doc.categoryName}`}>
        {doc.categoryName}
      </Link>
      {doc.subcategoryId && doc.subcategoryName && (
        <>
          <span className="text-subtle" aria-hidden>
            {" › "}
          </span>
          <Link
            href={`${listPath}?category=${doc.categoryId}&subcategory=${doc.subcategoryId}`}
            className={linkClass}
            title={`All documents in ${doc.categoryName} › ${doc.subcategoryName}`}
          >
            {doc.subcategoryName}
          </Link>
        </>
      )}
    </>
  );
}

export function TypeLink({ doc, listPath }: { doc: Doc; listPath: string }) {
  return (
    <Link href={`${listPath}?type=${doc.documentTypeId}`} className={linkClass} title={`All ${doc.documentType} documents`}>
      {doc.documentType}
    </Link>
  );
}
