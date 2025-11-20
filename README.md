# Random Tab Hopper

Random Tab Hopper is a small Firefox extension that automatically cycles through your open tabs.

You choose:

- which tabs to include (by range or by manual selection),
- how long to stay on each tab,
- whether to hop in random order or sequentially, and
- how much timing “wobble” there is between hops.

It’s meant as a playful little utility for when you want tabs to move on their own for a while.

---

## Features

### 🧭 Two ways to choose which tabs are included

You can decide which tabs the hopper uses in two different ways:

#### 1. Tab range (by position)

- Set **Tab start** and **Tab end** (1-based index, like the visible tab order in Firefox).
- The extension will only hop between tabs in that range.
- When you start the hopper in range mode, all included tabs are marked with a green dot (`🟢`) in their title so you can see at a glance which ones are in the pool.

This is handy when you’ve grouped the tabs you care about together.

#### 2. Manual tab list

If you’d rather just pick the tabs yourself:

- Toggle **Manual tab list** → **ON**.
  - This disables the range for hopping (but keeps it visible in case you switch back later).
- Click **Choose tabs**:
  - The button turns green and shows **Choosing…**.
  - Your **current tab is immediately added** to the list and gets a green dot (`🟢`) in its title.
  - While in “Choosing…” mode, switching to any tab will:
    - **First click on a tab** → add it to the list and mark it `🟢`.
    - **Click another tab later** → toggle membership again when you come back to it:
      - if it was selected, it will be removed and the green dot cleared,
      - if it wasn’t, it will be added and marked.

When you’re done picking:

- Click **Choose tabs** again (now showing “Choosing…”):
  - The button goes back to orange and says **Choose tabs** again.
  - The manual selection is saved.
  - The popup shows something like:  
    `Manual tab list active (5 tabs selected).`

> Note: Firefox doesn’t send an event when you click the *already active* tab again, so if you select the current tab by accident and want to unselect it, just switch to another tab and then back while “Choosing…” is active. That second activation will toggle it off.

### 🟢 Green tab markers

To keep track of what the hopper will touch, the extension uses a simple visual cue:

- Any tab that’s part of the current **range** or **manual list** gets a green dot in its title:  
  `🟢 Example Site – Mozilla Firefox`

This is done by temporarily adjusting the page title. When a tab is removed from the selection (or cleared), the original title is restored.

There’s also a **Clear** button that:

- clears the manual tab list,
- clears internal range tracking, **and**
- sends a “remove green dot” message to **all open tabs** in all windows.

If you have lingering green dots from older versions or previous sessions, pressing **Clear** once after installing this version will wipe them.

---

## ⏱ Timing controls

### Base delay

- **Seconds per tab**: how long to stay on each tab before hopping.

### Total running time

- **Total minutes**: how long the entire hopping session should last.
  - When the time is up, the hopper automatically stops.
  - The status at the bottom changes back to **Stopped**.

### Timing variance (two modes, mutually exclusive)

There are two ways to make the delay less “robotic”:

#### 1. Timing Variance (percentage)

- **Timing Variance** toggle (ON/OFF).
- **Variance amount** slider (0–100%).
- If enabled, each hop delay is picked randomly within ±X% of your base delay.
  - Example: base 5s, 25% → hops randomly between 3.75s and 6.25s.

#### 2. Custom Variance Range (seconds around base)

- **Custom Variance Range** toggle (ON/OFF).
- A dual slider with **Min** and **Max** in seconds.
- If enabled, each hop delay is:
  - base delay ± a random amount between Min and Max.
  - Example: base 5s, Min 1s, Max 2s → a hop can be anywhere between 3–7 seconds.

The two systems are **mutually exclusive**:

- Turning on the **percentage** variance will automatically turn off the custom range.
- Using the custom range will turn off the percentage variance.
- Sliding one of them automatically enables that mode and disables the other.

---

## 🔁 Random vs Sequential mode

- **Random**: each hop picks one of the allowed tabs at random.
- **Sequential**: the hopper walks through the allowed tabs in order and loops back to the start.

You can switch mode with the **Mode** button, which toggles between:

- `Random`
- `Sequential`

The current mode is also stored, so it will be remembered the next time you open the popup.

---

## 🧍 Stop on human input

There’s an option to let any obvious human interaction stop the hopper automatically:

- **Stop on human input** (checkbox).

When enabled:

- Pressing **Space** on any page (while **not** typing in an input/textarea/content-editable field), or
- Manually switching to another tab

…will immediately stop the hopping. The status text at the bottom will switch to **Stopped** so you have a visual confirmation.

If you want the hopper to keep running no matter what you do, just untick **Stop on human input**.

---

## ▶️ Controls

At the bottom of the popup you have:

- **Start**
  - Validates your settings.
  - Starts a new hopping run.
  - Marks range tabs with green dots if you’re using the tab range.
- **Pause / Resume**
  - Toggles between pausing and resuming the current run.
  - When paused, remaining time is preserved and resumes from there.
- **Stop**
  - Stops the current run immediately.
  - Does not change your settings or selections.
- **Clear**
  - Clears all manual selections.
  - Clears range tracking.
  - Removes green dots from all tabs.

Status text:

- **Running…** (green)
- **Paused** (amber)
- **Stopped** (red)

---

## 🔌 How it works under the hood (short version)

- A background script keeps track of the state:
  - which window it’s working in,
  - selected tab IDs,
  - range start/end,
  - timing settings,
  - mode (random/sequential),
  - whether to stop on human input.
- A content script runs in each tab and listens for simple messages:
  - `MARK_TAB` → add `🟢` to the title,
  - `UNMARK_TAB` → restore the original title,
  - keydown events for the Space bar (outside of text fields).
- The popup is just a control panel:
  - reads and writes settings via `browser.runtime.sendMessage`,
  - updates its own UI based on the current state.

---

## 🧩 Installation (temporary, for development)

1. Build / clone the repo somewhere on your machine.

2. Open Firefox and go to:

   ```text
   about:debugging#/runtime/this-firefox
   
## Keyboard shortcuts

These work while the hopper is running on a normal webpage (not inside the popup).

- **Space** – Stop (when “Stop on human input” is enabled)
- **→ (Right Arrow)** – Jump to the next included tab immediately
- **← (Left Arrow)** – Go back to the previously shown tab in this run
- **P** – Pause
- **Enter** – Resume
- **S** – Stop (same as the Stop button)
- **Mouse click on a tab** – Stop (when “Stop on human input” is enabled)

You can also click the **Hotkeys** button in the popup to see this list inside the extension.

