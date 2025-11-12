import time
import random
import argparse
import platform
from typing import List, Optional

# Fallback hotkeys (used only if UIA selection isn't possible)
import pyautogui

# Windows UI Automation (only used on Windows)
WIN = platform.system().lower().startswith("win")
if WIN:
    try:
        from pywinauto import Application
        from pywinauto.controls.uia_controls import TabItemWrapper
        from pywinauto.uia_element_info import UIAElementInfo
    except Exception:
        Application = None  # we'll fall back to hotkeys


def find_firefox_window(title_hint: str = " - Mozilla Firefox"):
    """Return a pywinauto window wrapper for the first Firefox window that matches."""
    if not WIN or Application is None:
        return None
    try:
        app = Application(backend="uia").connect(title_re=f".*{title_hint}.*", found_index=0, timeout=3)
        # The window title is usually like "Page Title - Mozilla Firefox"
        # If title_hint didn't work, try a looser match
    except Exception:
        try:
            app = Application(backend="uia").connect(title_re=".*Firefox.*", found_index=0, timeout=3)
        except Exception:
            return None
    # Grab the top-level window
    try:
        for w in app.windows():
            title = w.window_text()
            if title_hint in title or "Firefox" in title:
                return w
        return None
    except Exception:
        return None


def get_tab_items_sorted(win) -> List[TabItemWrapper]:
    """
    Return visible Firefox tabs (TabItem controls) left->right.
    Some Firefox builds expose a single Tab control; others expose TabItems under panes.
    We gather all TabItems under the window and sort by their screen x position.
    """
    if not WIN or win is None:
        return []

    # Collect all descendants that are TabItem
    try:
        descendants = win.descendants(control_type="TabItem")
    except Exception:
        descendants = []

    # Filter only visible, with a name (tab title)
    items = []
    for d in descendants:
        try:
            rect = d.rectangle()
            name = d.window_text()
            if rect.width() > 0 and rect.height() > 0 and name:
                items.append(d)
        except Exception:
            continue

    # Sort by left x (left-to-right order on the tab strip)
    items.sort(key=lambda w: w.rectangle().left)
    return items


def select_tab_uia(win, one_based_index: int) -> bool:
    """
    Select tab N via UIA instantly. Returns True if successful.
    """
    if not WIN or win is None:
        return False

    tabs = get_tab_items_sorted(win)
    if not tabs:
        return False

    # Cap index to available tabs
    idx = max(1, min(one_based_index, len(tabs))) - 1
    target = tabs[idx]

    # First try SelectionItem pattern if available
    try:
        if hasattr(target, "select"):
            target.select()
            return True
    except Exception:
        pass

    # Fallback: click the tab directly (still one jump; no scrolling)
    try:
        target.click_input()
        return True
    except Exception:
        return False


def select_tab_hotkey(index: int, total_tabs_hint: Optional[int] = None):
    """
    Fallback: use Firefox hotkeys.
    1..8 via Ctrl+<num>; 9 = last; >9: go last then PageUp left.
    (Might look like it's scrolling; only used if UIA fails.)
    """
    if 1 <= index <= 8:
        pyautogui.hotkey("ctrl", str(index))
        return
    if index == 9:
        pyautogui.hotkey("ctrl", "9")
        return
    # index > 9
    pyautogui.hotkey("ctrl", "9")  # last tab
    if total_tabs_hint is None:
        return
    steps_left = max(0, total_tabs_hint - index)
    for _ in range(steps_left):
        pyautogui.hotkey("ctrl", "pageup")
        time.sleep(0.01)


def main():
    parser = argparse.ArgumentParser(description="Instantly switch among Firefox tabs (Windows/UIA), or fallback to hotkeys.")
    parser.add_argument("--tab-start", type=int, default=1, help="First tab index to include (1-based). Default: 1")
    parser.add_argument("--tab-end", type=int, required=True, help="Last tab index to include (inclusive).")
    parser.add_argument("--seconds", type=float, required=True, help="Seconds to stay on each tab before switching.")
    parser.add_argument("--total-minutes", type=float, required=True, help="Total time to run, in minutes.")
    parser.add_argument("--window-title-hint", type=str, default=" - Mozilla Firefox",
                        help="Substring of the Firefox window title to focus automatically.")
    parser.add_argument("--jitter", type=float, default=0.25, help="±fraction jitter for wait time (0.25 = ±25%%). 0 to disable.")
    args = parser.parse_args()

    if args.tab_start < 1 or args.tab_end < args.tab_start:
        raise SystemExit("Invalid tab range.")
    if args.seconds <= 0 or args.total_minutes <= 0:
        raise SystemExit("seconds and total-minutes must be > 0")

    total_seconds = int(args.total_minutes * 60)
    t_stop = time.time() + total_seconds

    # Try to bind a Firefox window (so UIA selection is instant)
    win = find_firefox_window(args.window_title_hint) if WIN else None
    use_uia = WIN and (win is not None)

    if use_uia:
        print("Using Windows UI Automation for instant tab switching.")
    else:
        print("UIA not available; falling back to hotkeys (you may see scrolling).")

    print(f"Running for ~{total_seconds}s, switching every ~{args.seconds}s among tabs {args.tab_start}..{args.tab_end}. Ctrl+C to stop.")

    try:
        while time.time() < t_stop:
            target = random.randint(args.tab_start, args.tab_end)

            if use_uia:
                ok = select_tab_uia(win, target)
                if not ok:
                    # Window might have changed; try to re-bind once
                    win = find_firefox_window(args.window_title_hint)
                    ok = select_tab_uia(win, target) if win else False
                    if not ok:
                        # Fall back for this hop
                        select_tab_hotkey(target, args.tab_end)
            else:
                select_tab_hotkey(target, args.tab_end)

            # sleep with jitter
            if args.jitter > 0:
                low = max(0.05, args.seconds * (1 - args.jitter))
                high = args.seconds * (1 + args.jitter)
                wait = random.uniform(low, high)
            else:
                wait = args.seconds

            remaining = max(0, t_stop - time.time())
            time.sleep(min(wait, remaining))

    except KeyboardInterrupt:
        print("\nStopped by user.")


if __name__ == "__main__":
    main()
