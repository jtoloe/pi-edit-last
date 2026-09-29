# pi-edit-last

A Pi extension that opens the latest assistant response in an editor and loads the result into the input box.

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

When `$VISUAL` or `$EDITOR` is set, the latest assistant response opens directly in that external editor.
When neither is set, the response opens in Pi's built-in multi-line editor, where `Ctrl+G` falls back to the external editor.

When you submit, the edited text becomes the input box content.
Press Enter to send it.
If you cancel (`Esc`, `Ctrl+C`, or a non-zero editor exit), the input is left unchanged.

## How it works

The command reads the latest assistant response from the session branch.
When an external editor is configured, it suspends the Pi TUI, writes the response to a temp file, spawns `$EDITOR` with the terminal inherited, waits for it to exit, then restores the TUI and loads the file contents into the input.
This is the same suspend/resume handoff Pi uses for its own `Ctrl+G`, which is why terminal editors like `nvim` work correctly.

## Development

```bash
npm install
npm run typecheck
```

## License

MIT
