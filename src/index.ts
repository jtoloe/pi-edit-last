import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

type ContentBlock = {
  type?: string;
  text?: string;
};

type AssistantMessage = {
  role?: string;
  content?: unknown;
  toolName?: string;
};

type MessageEntry = {
  type?: string;
  message?: AssistantMessage;
};

const extractText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const contentBlock = block as ContentBlock;
      return contentBlock.type === "text" && typeof contentBlock.text === "string"
        ? contentBlock.text
        : "";
    })
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
};

const snippet = (text: string): string => {
  const codePoints = Array.from(text.replace(/\s+/g, " ").trim());
  return codePoints.length > 60
    ? `${codePoints.slice(0, 60).join("")}\u2026`
    : codePoints.join("");
};

const collectEditable = (ctx: ExtensionContext): { label: string; text: string }[] => {
  const branch = ctx.sessionManager.getBranch() as MessageEntry[];
  const items: { label: string; text: string }[] = [];

  for (const entry of branch) {
    if (entry?.type !== "message") {
      continue;
    }
    const message = entry.message;
    const text = extractText(message?.content).trim();
    if (text.length === 0) {
      continue;
    }
    if (message?.role === "assistant") {
      items.push({ label: `assistant: ${snippet(text)}`, text });
    } else if (message?.role === "toolResult") {
      items.push({ label: `toolResult(${message.toolName ?? "tool"}): ${snippet(text)}`, text });
    }
  }

  return items.reverse();
};

const loadShortcuts = async (): Promise<Record<string, string>> => {
  let raw: string;
  try {
    raw = await readFile(join(getAgentDir(), "pi-edit-last.json"), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  const shortcuts = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).shortcuts : undefined;
  if (!shortcuts || typeof shortcuts !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(shortcuts)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([command, shortcut]) => [command, shortcut.trim()]),
  );
};

const findLatestResponse = (ctx: ExtensionContext): string | undefined => {
  const branch = ctx.sessionManager.getBranch() as MessageEntry[];

  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }

    const text = extractText(entry.message.content).trim();
    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
};

const resolveExternalEditor = (configured?: string): string | undefined => {
  const configuredEditor =
    typeof configured === "string" ? configured.trim() : undefined;
  if (configuredEditor) {
    return configuredEditor;
  }

  const visual = process.env.VISUAL?.trim();
  if (visual) {
    return visual;
  }

  const editor = process.env.EDITOR?.trim();
  return editor || undefined;
};

const runExternalEditor = async (
  command: string,
  content: string,
  cwd: string,
): Promise<string | undefined> => {
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "pi-edit-last-"));
    const filePath = join(directory, "response.md");
    await writeFile(filePath, content, "utf-8");

    const [editor, ...editorArgs] = command.split(/\s+/).filter(Boolean);
    const exitCode = await new Promise<number | null>((resolve) => {
      const child = spawn(editor, [...editorArgs, filePath], {
        cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });

    if (exitCode !== 0) {
      return undefined;
    }

    return (await readFile(filePath, "utf-8")).replace(/^\uFEFF/, "").replace(/\n$/, "");
  } finally {
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
};

const runEditor = async (
  ctx: ExtensionContext,
  title: string,
  text: string,
  configuredEditor?: string,
): Promise<string | undefined> => {
  const external =
    ctx.mode === "tui" ? resolveExternalEditor(configuredEditor) : undefined;
  return external
    ? await openExternalEditor(ctx, external, text)
    : await ctx.ui.editor(title, text);
};

const openExternalEditor = (
  ctx: ExtensionContext,
  command: string,
  content: string,
): Promise<string | undefined> => {
  return ctx.ui.custom<string | undefined>(async (tui, _theme, _keybindings, done) => {
    tui.stop();
    let result: string | undefined;
    try {
      process.stdout.write(
        `Launching external editor: ${command}\nPi will resume when the editor exits.\n`,
      );
      result = await runExternalEditor(command, content, ctx.cwd);
    } finally {
      tui.start();
      tui.requestRender(true);
    }
    done(result);
    return { render: () => [], invalidate: () => {} };
  });
};

const editMessage = async (ctx: ExtensionContext, configuredEditor?: string): Promise<void> => {
  const items = collectEditable(ctx);
  if (items.length === 0) {
    ctx.ui.notify(
      "No assistant messages or tool results with text found on the current branch.",
      "warning",
    );
    return;
  }

  const chosen = await ctx.ui.select(
    "Edit message (newest first)",
    items.map((item, index) => `${index + 1}. ${item.label}`),
  );
  const chosenIndex = Number(chosen?.match(/^\d+/)?.[0] ?? 0) - 1;
  const item = items[chosenIndex];
  if (!item) {
    ctx.ui.notify("Cancelled. Input unchanged.", "info");
    return;
  }

  const edited = await runEditor(ctx, "Edit selected message", item.text, configuredEditor);
  if (edited === undefined) {
    ctx.ui.notify("Cancelled. Input unchanged.", "info");
    return;
  }

  ctx.ui.setEditorText(edited);
  ctx.ui.notify("Loaded edited message into the input.", "info");
};

const editLast = async (ctx: ExtensionContext, configuredEditor?: string): Promise<void> => {
  const text = findLatestResponse(ctx);
  if (!text) {
    ctx.ui.notify(
      "No assistant response with text found on the current branch.",
      "warning",
    );
    return;
  }

  const edited = await runEditor(ctx, "Edit latest response", text, configuredEditor);

  if (edited === undefined) {
    ctx.ui.notify("Cancelled. Input unchanged.", "info");
    return;
  }

  ctx.ui.setEditorText(edited);
  ctx.ui.notify("Loaded edited response into the input.", "info");
};

export default function (pi: ExtensionAPI) {
  pi.registerCommand("edit-last", {
    description: "Open the latest assistant response in an editor, then load the result into the input",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      await editLast(ctx, pi.getSettings().externalEditor);
    },
  });

  let shortcutsRegistered = false;
  pi.on("session_start", async (_event, ctx) => {
    if (shortcutsRegistered) {
      return;
    }

    let shortcuts: Record<string, string>;
    try {
      shortcuts = await loadShortcuts();
    } catch {
      ctx.ui.notify("pi-edit-last: could not read ~/.pi/agent/pi-edit-last.json", "warning");
      return;
    }

    const commands: Record<string, { description: string; run: (ctx: ExtensionContext, configuredEditor?: string) => Promise<void> }> = {
      "edit-last": { description: "Edit the latest assistant response", run: editLast },
      "edit-message": { description: "Pick a previous message or tool result to edit", run: editMessage },
    };

    const boundShortcuts = new Set<string>();
    for (const [command, shortcut] of Object.entries(shortcuts)) {
      const handler = commands[command];
      if (!handler) {
        ctx.ui.notify(`pi-edit-last: unknown command "${command}" in shortcuts config`, "warning");
        continue;
      }
      if (boundShortcuts.has(shortcut)) {
        ctx.ui.notify(`pi-edit-last: shortcut "${shortcut}" is already bound to another command`, "warning");
        continue;
      }
      boundShortcuts.add(shortcut);
      pi.registerShortcut(shortcut as KeyId, {
        description: handler.description,
        handler: async (shortcutCtx) => {
          if (!shortcutCtx.isIdle()) {
            shortcutCtx.ui.notify("pi-edit-last: wait until the agent is idle.", "info");
            return;
          }
          await handler.run(shortcutCtx, pi.getSettings().externalEditor);
        },
      });
    }

    shortcutsRegistered = true;
  });

  pi.registerCommand("edit-message", {
    description:
      "Pick a previous assistant message or tool result to edit, then load the result into the input",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      await editMessage(ctx, pi.getSettings().externalEditor);
    },
  });
};


