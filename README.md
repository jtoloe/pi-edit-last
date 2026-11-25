# pi-edit-last

A Pi extension that opens assistant responses and tool results in an editor and loads the result into the input box.

## Why

Long assistant replies are hard to reuse by hand.
`/edit-last` grabs the newest reply, drops it into an editor, and lets you shape it into your next message.

## Install

```bash
pi install git:github.com/ldelossa/pi-edit-last
```

Then reload Pi:

```text
/reload
```

## Usage

```text
/edit-last
```

Opens the latest assistant response.

```text
/edit-message
```

Lists assistant messages and tool results on the current branch (newest first) and opens the chosen one.

When `$VISUAL` or `$EDITOR` is set, the latest assistant response opens directly in that external editor.
When neither is set, the response opens in Pi's built-in multi-line editor, where `Ctrl+G` falls back to the external editor.

When you submit, the edited text becomes the input box content.
Press Enter to send it.
If you cancel (`Esc`, `Ctrl+C`, or a non-zero editor exit), the input is left unchanged.

## Keyboard shortcut

Optionally bind the commands to keys. Create `~/.pi/agent/pi-edit-last.json`:

```json
{ "shortcuts": { "edit-last": "ctrl+shift+e", "edit-message": "ctrl+shift+m" } }
```

Both keys are optional. Pi key syntax applies (e.g. `alt+e`, `ctrl+shift+x`). Reload after editing the file. Unknown command names and duplicate keys produce a warning and are skipped; keys Pi cannot parse are silently ignored. No config file means no shortcuts.

## How it works

`/edit-last` reads the latest assistant response from the session branch. `/edit-message` lists all assistant messages and tool results on the branch and lets you pick one.
When an external editor is configured, it suspends the Pi TUI, writes the response to a temp file, spawns `$EDITOR` with the terminal inherited, waits for it to exit, then restores the TUI and loads the file contents into the input.
This is the same suspend/resume handoff Pi uses for its own `Ctrl+G`, which is why terminal editors like `nvim` work correctly.

## Development

```bash
npm install
npm run typecheck
```

## License

MIT
