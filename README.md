<p align="center">
  <img src="docs/media/hero.jpg" alt="Better Vest on the Vest Markets trade page: the dock, the Execute card and a position with its TP and SL on the chart" width="100%">
</p>

<h1 align="center">Better Vest</h1>

<p align="center">
  <b>The trading tools I wanted on Vest, added to the Vest page you already use.</b><br>
  A free Chrome extension for <a href="https://next.vestmarkets.com">Vest Markets</a>. By Astral, Discord <b>@ax4p</b>.
</p>

<p align="center">
  <a href="https://bv.astrals.dev"><b>bv.astrals.dev</b></a>
  &nbsp;·&nbsp; <a href="https://github.com/ax4p/better-vest/releases/latest">Download</a>
  &nbsp;·&nbsp; <a href="https://bv.astrals.dev/#install">Install</a>
  &nbsp;·&nbsp; <a href="SECURITY.md">Security</a>
</p>

<br>

Every tool, and the install on a Mac and on Windows, is shown on **[bv.astrals.dev](https://bv.astrals.dev)**. This repo holds the code and the releases.

## Download

Each [release](https://github.com/ax4p/better-vest/releases/latest) has three zips. Pick one:

| Zip | What's in it |
|---|---|
| `better-vest-9.3.2.zip` | **Standard.** Everything. Take this one if you're not sure. |
| `better-vest-lite-9.3.2.zip` | **Lite.** Everything but the spoken voice lines, under 1 MB. |
| `better-vest-nostats-9.3.2.zip` | **No stats.** Standard without the usage stats. See [Security](SECURITY.md#the-usage-stats). |

Then load it in Chrome: the [video and steps](https://bv.astrals.dev/#install) on the site, or the [install guide](CONTRIBUTING.md) here. After that it updates itself.

## What it does

- **[Copy trader](https://bv.astrals.dev/features/copy-trader):** trade one account and up to ten others follow it, in as many groups as you like.
- **[Trading on the chart](https://bv.astrals.dev/features/chart-trading):** drag your stop and target, stop and limit orders in one click, a trailing stop and auto breakeven.
- **The Execute card:** long or short in one click with the stop and target attached, in points, dollars or at a price, your size from the dollars you risk, and FLAT, 50% (hover it for 10%, 25%, 75% or your own share) and REV. Float it, put it in place of Vest's ticket or under the chart, and hide the buttons you don't use.
- **Price alerts:** click the chart where you want one. When price gets there you hear it and see a note. It never places an order.
- **Voice commands (beta):** hold a key and say "long" or "close half", or say "Astral" first. Your voice stays on your computer.
- **[Up to four charts](https://bv.astrals.dev/features/multi-chart),** each with its own market and timeframe.
- **[Limits and locks](https://bv.astrals.dev/features/limits):** a daily loss and profit limit, a tilt guard, and a lock button for the days you should stop.
- **A voice** that says what just filled, and a countdown to the New York open and the news.
- **Your look:** themes, your own colors, and a background behind Vest.
- **[P&L cards](https://bv.astrals.dev/features/pnl-cards)** of your day as an image, a video or a GIF, and a payout card.
- **[The Calendar](https://bv.astrals.dev/features/calendar):** every trade from every account as a daily P&L calendar.

## Is it safe?

- **Scanned.** `better-vest-9.3.2.zip` comes back clean on VirusTotal, with no engine flagging it ([report](https://www.virustotal.com/gui/file/8584d0882f304664573b6f9b5ef76e45ae855b1f776ecdb05ae5e4813b493525)).
- **Readable.** The [`extension`](extension) folder is the Standard zip, file for file, not minified.
- **Signed updates.** Your copy checks my signature and every file before it writes anything.
- **Safety switches.** If Vest changes something, I can pause one feature for everyone until it's fixed ([how](SECURITY.md#safety-switches)).
- **Small reach.** It runs only on next.vestmarkets.com and asks Chrome for `storage`, `alarms` and `tabGroups`. It never sees your password or keys, never withdraws, and trades only through Vest's own buttons and order code.

Everything it can do and every address it talks to: [Security](SECURITY.md).

## Is it allowed on Vest?

Vest's [terms](https://next.vestmarkets.com/terms) don't mention browser extensions or copy trading. The automation they rule out is manipulation, and Better Vest only places the orders you ask for, through Vest's own page. It doesn't use an API. Terms change, so read them yourself, especially before you copy trades on funded accounts.

## Support

Better Vest is free. If you buy a Vest account, the code **WICK** costs you nothing extra and keeps this going. When Vest's code box is empty, the extension puts it in for you and says so. It never replaces a code you have on, and you can switch that off in Settings > More > Support Astral. When another code is on, it asks first. If you'd rather tip, my EVM address is `0x9F308B10780f9b8FD65C6B94071529b75a3A9dA4`.

Bugs and ideas: Discord **@ax4p**.

## Credits and rights

Designed and built by **Astral** (Discord **@ax4p**). Not affiliated with Vest Markets.

© 2026 Astral. All rights reserved. You're welcome to install it and use it for your own trading. Redistributing it, selling it, rebranding it or publishing changed versions needs my permission. The full terms are in [LICENSE](LICENSE).
