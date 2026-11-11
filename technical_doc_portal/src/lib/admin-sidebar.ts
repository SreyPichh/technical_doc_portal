/** Cookie that remembers a collapsed admin sidebar. Read by the admin layout (so the first render is
 *  already right) and written by the sidebar. Kept out of the client component module on purpose:
 *  a server component importing a value from a "use client" file gets a reference, not the string. */
export const SIDEBAR_COOKIE = "admin-sidebar";
