# Random Tab Hopper

Random Tab Hopper is a Firefox extension that automatically cycles through your open tabs.  
You can use it to rotate pages while reading, keep different sites in view, or simply make browsing feel more dynamic.  
Everything is adjustable, from timing to order to how “natural” the switching feels.

---

## Features

- Switch tabs **randomly** or **in order**
- Adjustable **seconds per tab**
- Optional **Timing Variance (±%)** to add a natural delay wobble
- **Min / Max delay** slider using a dual-handle range control  
  - Disabled by default — turn it on to use a custom delay range
- **Stop on human input** so the extension pauses automatically when you interact
- Clean dark UI designed to blend into Firefox

---

## How it works

Choose the range of tabs you want to include, set the timing, and hit **Start**.  
The extension will begin switching between those tabs until the total time runs out or you stop it.

If you enable **Timing Variance**, each hop gets a small random adjustment.  
If you enable **Min/Max**, the extension ignores the fixed timing and picks a random delay between the two slider points instead.

You can pause or resume the cycle from the popup at any moment.

---

## Installation

### Temporary for development/testing
1. Open Firefox and visit:  
   `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this project.

> Temporary add-ons are removed when Firefox restarts.

### Permanent installation (recommended)
To install it like a normal extension:

1. Zip the extension folder (include `manifest.json`, icons, and scripts).
2. Go to the [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).
3. Upload it as an **Unlisted** add-on.
4. Download the signed `.xpi` file.
5. Install it by visiting  
   `about:addons → ⚙️ → Install Add-on From File…`.

This version stays installed even after restarts.

---

## Controls

| Setting | Description |
|--------|-------------|
| **Tab start / end** | Select the first and last tab index to include. |
| **Seconds per tab** | Base delay between each hop. |
| **Timing Variance (±%)** | Adds a random offset to the delay. |
| **Use Min/Max (seconds)** | Overrides base delay and picks a random time within this range. |
| **Total minutes** | Total duration before the extension stops automatically. |
| **Mode** | Random or Sequential tab order. |
| **Stop on human input** | Pauses hopping if you manually change tabs or interact. |

---

## Building from source

Clone the repo:
```bash
git clone https://github.com/StrawberryFields17/random-tab-hopper.git
cd random-tab-hopper
