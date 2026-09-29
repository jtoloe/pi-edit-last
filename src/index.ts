import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type ContentBlock = {
  type?: string;
  text?: string;
};

type AssistantMessage = {
  role?: string;
  content?: unknown;
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

const findLatestResponse = (ctx: ExtensionCommandContext): string | undefined => {
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

export default function (pi: ExtensionAPI) {
  pi.registerCommand("edit-last", {
    description: "Open the latest assistant response in an editor, then load the result into the input",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const text = findLatestResponse(ctx);
      if (!text) {
        ctx.ui.notify(
          "No assistant response with text found on the current branch.",
          "warning",
        );
        return;
      }

      const edited = await ctx.ui.editor("Edit latest response", text);
      if (edited === undefined) {
        ctx.ui.notify("Cancelled. Input unchanged.", "info");
        return;
      }

      ctx.ui.setEditorText(edited);
      ctx.ui.notify("Loaded edited response into the input.", "info");
    },
  });
}
