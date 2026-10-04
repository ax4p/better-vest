<p align="center">
  <img src="docs/media/hero.jpg" alt="Better Vest on the Vest Markets trade page: the dock, the Execute card and TP/SL on the chart" width="100%">
</p>

# Better Vest

A Chrome extension for [Vest Markets](https://next.vestmarkets.com) that puts your take profit and stop loss on the chart, adds a one-click order card, hotkeys, a focus mode, seven themes and a P&L calendar.

Made by **Astral** · Discord **@ax4p** · [Download the latest version](https://github.com/ax4p/better-vest/releases/latest)

## Why I made it

I trade NQ on Vest every day. The platform is fast and the funded program is good, but a few small things kept costing me time. Moving a stop meant opening the ticket and clicking through a confirmation, I couldn't see what a level was worth in dollars, and I had no way to look back at my days across all my accounts. So I built what I was missing. After using it on my own accounts for a while, I'm sharing it.

It all runs in your browser, on the Vest tab you already have open. There's no server, no sign-up and nothing to pay.

## What it does

### TP and SL on the chart

Hover your position on the chart and three small buttons appear under it: BE, TP and SL. Grab TP or SL and drag it to the level you want. While you drag, the label shows the dollar amount, the points and the R. Let go and it's set, with no confirmation popup. If you change your mind, Undo is there for five seconds.

BE moves your stop to entry plus 5% of the open profit, so a breakeven stop still locks in a little. You can change that in Settings. It never moves a stop backwards.

<p align="center"><img src="docs/media/tpsl.gif" alt="Dragging the take profit on the chart, with the dollar amount updating live, then Undo" width="760"></p>

### The Execute card

LONG and SHORT in one click, with your stop and target (in points) attached to every order. Pick the account at the top (5K, 10K, 25K or Custom) and the size presets follow it. Before you click, the card shows what the stop and the target are worth in dollars, the R:R, and how much of the account you're risking.

When you're in a position, it sits at the top of the card with its live P&L, and three buttons manage it. FLAT closes all of it. 50% closes half. REV closes it and opens the same size the other way, with the card's stop and target. It asks for a second click first, and it only opens the new side once Vest shows the old one closed. 50% and REV use Vest's own close window, the one the Close button in its Positions tab opens, so keep that tab open. REV works on NQ and MNQ, like the order hotkeys.

When you need the room, fold the card into a slim bar. Drag it anywhere.

<p align="center"><img src="docs/media/exec-card.png" alt="The Execute card: account, size, stop and target, risk and R:R, LONG, SHORT, FLAT, 50% and REV" width="760"></p>

The Partials switch is a preview for now. On the demo position it shows a plan with a first target and a runner. Real partial take-profits come in a later update.

### Hotkeys

W for long, S for short, E for a limit buy at the best bid, Q for a limit sell at the best ask, and H for breakeven. They're off until you switch them on with the Macros button in the dock, and every key can be remapped in Settings. They never fire while you're typing in a field, and they don't open TradingView's symbol search.

<p align="center"><img src="docs/media/hotkeys.gif" alt="Hotkeys on the demo position: each key shows what it did" width="760"></p>

### Focus mode

Hide the order ticket, the order book, the positions table or the drawing toolbar, and the chart grows into the space. Alt+F switches your whole focus setup on and off.

<p align="center"><img src="docs/media/focus.gif" alt="Focus mode hiding the ticket, the book and the positions table" width="760"></p>

### Themes

Dark, OLED, Astral, Nebula, Ember, Terminal and Light. The whole page follows, candles included.

<p align="center"><img src="docs/media/themes.jpg" alt="The same Vest page in all seven themes" width="100%"></p>

### Calendar

Every trade from every account, laid out as a daily P&L calendar. Next to it: win rate, profit factor, average risk in points, reward to risk, max drawdown and all your payouts. It builds itself from your own Vest history in a few seconds and keeps the data on your computer. Open it from the dock or with Alt+J.

<p align="center"><img src="docs/media/calendar.gif" alt="The Calendar: accounts, a day's details, stats and payouts" width="760"></p>

### Payout certificate and toolbar summary

When your payouts add up, open the Portfolio page and make a certificate of your lifetime total, then save it as an image. The toolbar button shows how today, this week and this month are going without opening anything.

<table>
  <tr>
    <td width="66%"><img src="docs/media/certificate.jpg" alt="Total payouts certificate"></td>
    <td width="34%"><img src="docs/media/popup.png" alt="Toolbar popup with today, this week and this month"></td>
  </tr>
</table>

<sub>The screenshots use the demo position and sample data. No real account is shown.</sub>

## Install

About two minutes. Works in Chrome, Brave, Edge and Arc.

1. Download **better-vest-7.5.0.zip** from the [latest release](https://github.com/ax4p/better-vest/releases/latest).
2. Unzip it.
   - **Mac:** double-click the zip.
   - **Windows:** right-click the zip and choose **Extract All**.

   Keep the folder somewhere it can stay, like Documents. Chrome runs the extension from that folder, so don't delete it afterwards.
3. Go to `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`).
4. Turn on **Developer mode** in the top right corner, then click **Load unpacked** and pick the `better-vest-7.5.0` folder.
5. Pin it: click the puzzle piece in the toolbar, then the pin next to Better Vest.
6. Open [next.vestmarkets.com](https://next.vestmarkets.com). The dock appears at the top of the page.

<p align="center"><img src="docs/media/install-extensions-page.png" alt="chrome://extensions with Developer mode on (1) and Load unpacked (2)" width="760"></p>

When Chrome starts, it may warn you about extensions in developer mode. That's normal for anything installed this way. Click **Keep**.

Leave Developer mode on afterwards. With it off, Chrome switches the extension off the next time it reloads, and an update reloads it.

### Updating

From 7.4 on, Better Vest updates itself. When a new version is out, an **Update** button shows up in the dock and the toolbar icon says NEW. Click it, read what's new, then click **Update**. The first time, Chrome asks for your Better Vest folder: pick the one you loaded in step 4 and allow it to edit files. After that it's one click. Your settings and your Calendar stay as they are.

<p align="center"><img src="docs/media/update.png" alt="The update page: what's new, and the Update button" width="620"></p>

Before it writes anything, it downloads every file of the new version from this repo and checks them against a list I sign on my own computer. If one file doesn't match, nothing changes.

Coming from 7.3? That version can't update itself yet, so do it by hand once: download the new zip, unzip it over your old folder (replace the files), then press the round arrow on the Better Vest card in `chrome://extensions`.

## Try it first on the demo position

On the trade page, press **Alt+Shift+D**. A demo position appears on the chart. You can drag its TP and SL, press BE, try the hotkeys and press LONG, SHORT, FLAT, 50% or REV on the card: none of that is sent to Vest while the demo is on, the card just tells you what it would do. Vest's own buttons are still real, so leave those alone while you practice. Press Alt+Shift+D again to remove the demo.

## Shortcuts

| Keys | What they do |
|---|---|
| W / S | Long / short at market, with the card's size, stop and target |
| E / Q | Limit buy at the best bid / limit sell at the best ask |
| H | Stop to breakeven |
| Alt+F | Focus mode on or off |
| Alt+J | Open the Calendar |
| Alt+Shift+D | Demo position on or off |

The order keys work on NQ and MNQ while the Execute card is showing. E and Q start switched off: turn them on in Settings > Exec > Macros. They also need chart TP/SL to be on.

## Privacy and safety

- The code is right here in the [`extension`](extension) folder. It's exactly what's inside the zip, so you can read it before you install.
- It only runs on next.vestmarkets.com.
- The one other place it talks to is GitHub. Every 6 hours, and when Chrome starts, it asks GitHub which version is the latest. Nothing about you or your trading is in that request. When you click Update, it downloads the new files from this repo. You can turn the check off in the toolbar popup.
- Orders go through Vest's own buttons and order form, and closes through Vest's own close window. TP and SL changes go through Vest's own TP/SL handler. The extension doesn't build trading requests of its own.
- The Calendar reads your history with read-only requests from your open Vest tab and stores it on this computer. Nothing is sent to me or to anyone else.
- No analytics, no tracking, no account.

It's still a trading tool, so start with the demo position and watch your first few real orders the way you would with any new setup.

## FAQ

**Is this made by Vest?**
No. It's an independent project and has no connection to Vest Markets.

**Does it cost anything?**
No.

**Does it work on trade.vestmarkets.com?**
No, only on next.vestmarkets.com.

**I installed it and nothing shows up on Vest.**
Check that it's switched on in `chrome://extensions`, then reload the Vest tab. If you have another copy installed too (a userscript or a second version of the extension), keep just one on.

**Can I share the zip or post it somewhere else?**
Please share the link to this page instead, so people always get the current version. The details are in the license.

## Support the project

Better Vest is free. If you're buying a Vest evaluation or instant account, use the code **WICK** at checkout. It doesn't cost you anything extra, and it helps keep this going.

On the purchase screens the extension shows a small card with a **Use WICK** button that puts the code in for you. When Vest has filled in its own default code VEST, Better Vest switches it to WICK by itself, where you can see it, and only keeps WICK if it gives the same discount or more. Any other code is never touched. Undo on the card puts VEST back and stops the switch, and Settings > More turns it on or off.

## Credits and rights

Better Vest is designed and built by **Astral** (Discord: **@ax4p**).

© 2026 Astral. All rights reserved. You're welcome to install it and use it for your own trading. Redistributing it, selling it, rebranding it or publishing changed versions needs my permission. The full terms are in [LICENSE](LICENSE).

Bugs, ideas or permission requests: Discord **@ax4p**.
