import { isTauri } from "../db/client";

export async function openExternal(url: string) {
  const target = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(target);
  } else {
    window.open(target, "_blank", "noopener");
  }
}

/** Lets the user pick files and copies them into the app's attachment folder. */
export async function pickAttachments(): Promise<{ path: string; name: string }[]> {
  if (!isTauri()) {
    throw new Error("Anhänge funktionieren nur in der Desktop-App.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const picked = await open({ multiple: true, directory: false });
  if (!picked) return [];
  const files = Array.isArray(picked) ? picked : [picked];
  const out: { path: string; name: string }[] = [];
  for (const source of files) {
    const path = await invoke<string>("import_attachment", { source });
    const name = source.split(/[\\/]/).pop() ?? source;
    out.push({ path, name });
  }
  return out;
}

/** Lets the user pick a folder; it is linked (not copied) and opened in the explorer later. */
export async function pickFolder(): Promise<{ path: string; name: string } | null> {
  if (!isTauri()) {
    throw new Error("Ordner funktionieren nur in der Desktop-App.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  if (!picked || Array.isArray(picked)) return null;
  return { path: picked, name: picked.replace(/[\/]+$/, "").split(/[\/]/).pop() || picked };
}

export async function openAttachment(path: string, kind: "file" | "folder" = "file") {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(kind === "folder" ? "open_folder" : "open_attachment", { path });
}

export async function deleteAttachmentFile(path: string) {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_attachment", { path });
}
