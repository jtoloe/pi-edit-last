# pi-edit-last

A Pi extension that opens the latest assistant response in an editor and loads the result into the input box.

## Why

Long assistant replies are hard to reuse by hand.
`/edit-last` grabs the newest reply, drops it into Pi's editor, and lets you shape it into your next message.

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

The latest assistant response opens in Pi's multi-line editor.
Edit it there, or press `Ctrl+G` to edit it in your external editor.
`Ctrl+G` uses `externalEditor`, then `$VISUAL`, then `$EDITOR`.

When you submit, the edited text becomes the input box content.
Press Enter to send it.
If you cancel (`Esc` or `Ctrl+C`), the input is left unchanged.

## How it works

The command uses `ctx.ui.editor()`.
That editor already wires `Ctrl+G` to Pi's external editor handoff, which suspends the TUI and spawns `$EDITOR` with a real terminal.
This is why terminal editors like `nvim` work, unlike extensions that spawn an editor detached.

## Development

```bash
npm install
npm run typecheck
```

## License

MIT
