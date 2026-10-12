# progress-bar

An animated, step-by-step progress bar for Claude Code. When a request will take Claude more than a few actions, Claude announces its plan, and a bar of dots appears above the prompt: one dot per step, the current step drawn as four orange dots that dance, and a messenger dot that glides along a dotted thread to the next step when one finishes.

![The bar during a five-step task](docs/demo.gif)

## What you see

- **One dot per step.** Steps still to come are grey and asleep. Finished steps are solid orange.
- **The current step dances.** Four orange dots, in the spirit of Claude's own working indicator. There are eight dances, and each task draws its own order, so step 2 never always looks the same.
- **A step finishes.** The four dots fold into one, which pulses once. A messenger dot leaves, lights the thread behind it and splits into four at the next step.
- **Plans change.** If Claude announces a new step while the messenger is travelling, it changes course without stopping. A skipped step lights up as the messenger passes it.
- **The work ends.** The last step folds in, the remaining steps light up, every dot pulses once together, and the bar fades away.
- **Details.** A `Details` button (or `/progress`) opens a panel with the request, the time spent, the step in progress, the number of actions, the context used, each step with its duration, and each subagent at work.

In a terminal session the bar is drawn in characters: a solid dot per finished step, the working indicator's glyphs on the current one, an empty dot for the rest.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install progress-bar --marketplace Gimzki/claude-code-progress-bar
```

Answer `y` to add the marketplace, then choose a scope. Once installed at the user scope, the bar also shows in the Claude desktop app's Code tab.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `language` | `en`, `fr` | `en` |

`language` sets the language of the bar and of the panel. The steps themselves are written by Claude, in your language.

## How it works

The mod registers one tool, `progress`, with `steps` (the plan, 2 to 8 short steps) and `step` (the number of the step that starts). A line added to the system prompt asks Claude to call it at the start of any request that takes more than three actions, and again at each new step. Subagents are ignored. The bar clears itself when the turn ends; an interruption clears it at once.

Everything the bar shows is derived from the history of the steps (which step, at what time) and the current time. The same history always gives the same picture, which is what keeps the animation continuous:

- On the desktop app, the bar is a surface module (`hooks/bar-client.tsx`) that the app keeps as it is when it rebuilds the band, and redraws only when a step changes, the work ends or the band changes width. Each new event is timed from the moment the display sees it.
- The drawing (`hooks/dots.ts`) is one SVG image. Positions are static CSS `calc()` values, so the bar is right at any width; everything that moves is SMIL, the one animation clock that starts at the same instant in every image. An animation already played is never written again: its end state becomes the image's starting state.

## What it reads and sends

Nothing leaves your machine. The mod makes no network request and reads or writes no file. It keeps the bar's state in Claude Code's own session state, adds one line to the system prompt (asking Claude to announce its steps), registers the `progress` tool and the `/progress` command, and reads two things from Claude Code for the panel: the list of subagents and the share of the context window in use.

The mod never calls a tool or runs a command itself. The tool calls in `tests/` are made through Claude Code's test kit, to play a session in the tests.

Every hook, and what it changes:

| Hook | What it does |
| --- | --- |
| `session.start` | Registers the `progress` tool and the `/progress` command, and starts a one-second clock that only writes while a task is in progress (for the panel's durations). |
| `prompt.compose` | Adds one section at the end of the system prompt, and changes nothing else: *"When a request will take you more than three actions, first call mcp__progress-bar__progress with your steps, then call it again each time a new step starts. Never for a short answer, never from a subagent."* |
| `turn.start` | Notes the text of the request, to show it in the panel. |
| `tool.call` (every tool) | Counts the action for the panel, then passes the call on unchanged. |
| `tool.call` (`progress` only) | Answers the mod's own `progress` tool: it records the plan and replies with one line, such as `Bar updated: step 2 of 5.` Calls from subagents are ignored. No other tool is ever answered in place of the tool. |
| `turn.complete` | Plays the end of the bar, then clears it. An interrupted turn clears it at once. |
| `command.run` (`/progress`) | Opens the panel. Nothing is written to the conversation. |
| `ui.render` (band above the prompt, and the panel) | Draws the bar and the panel. |

## Development

```
claude plugin validate .
claude plugin test .
```

The tests cover the plan, the timeline (step changes in flight, skipped steps, a finish during a flight, a step going back), the drawing (no animation already played at any instant, no image identical to a previous one, the messenger never at zero scale), the band on the terminal and the desktop surfaces in both languages, and the panel.

## Français

Une barre de progression animée, étape par étape, pour Claude Code. Quand une demande lui prendra plus de quelques actions, Claude annonce son plan, et une barre de points apparaît au-dessus du champ de saisie: un point par étape, l'étape en cours dessinée par quatre points orange qui dansent, et un point messager qui glisse sur un fil pointillé jusqu'à l'étape suivante quand une étape se termine. Chaque tâche tire son propre ordre parmi huit danses. Pour l'interface en français, réglez l'option `language` à `fr`.

## License

MIT. See [LICENSE](LICENSE).
