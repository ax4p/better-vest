# Is Better Vest safe?

People keep asking, and they should. Anything that sits next to your trading account deserves the question. This page says exactly what Better Vest can do, what it can't, and how you can check every part of that yourself. Nothing here is a promise you have to take my word for.

It comes in three editions: Standard, Lite (Standard without the voice) and No stats (Standard without the usage stats). This page is true of all three unless it says otherwise.

## The short version

- It only runs on next.vestmarkets.com.
- It asks Chrome for three permissions, `storage`, `alarms` and `tabGroups`, and nothing else.
- It never sends me your account, your trades, your balances or anything you type. It sends me anonymous usage stats, so I know how many people use it and what to make better, and every 3 minutes it asks my site whether I've paused a feature. See [The usage stats](#the-usage-stats) and [Safety switches](#safety-switches).
- It never sees your password or your wallet's keys, and never stores your Vest login. (Read-only requests, like the Calendar reading your trade history, borrow the login your Vest tab already has, in memory. The copy trader's own code never touches it.)
- It never withdraws, never changes account settings, never creates anything. The one account action it has is **Request payouts**: when you press it and confirm, it claims profit from your funded accounts to your Primary account through Vest's own Claim profit window. See [Request payouts](#request-payouts).
- The copy trader is off until you switch it on. Then it copies your leader account's trades to your other Vest accounts through Vest's own order code. See [The copy trader](#the-copy-trader).
- Some tools act on their own once you switch them on: the copy trader, a trailing stop or auto breakeven moving your stop (only ever tighter), and a stop order you armed sending its order when the price gets there. See [How it places orders](#how-it-places-orders).
- At checkout, when Vest's code box is empty, it puts my code WICK in as the purchase screen opens, so you get the discount, and tells you it did. It never replaces a code you have on, and you can switch it off. When another code is on, it asks you first at the button that buys, and only keeps WICK when you get the same discount or more. See [The WICK code](#the-wick-code).
- Multi-chart opens hidden Vest tabs, one for each extra market, in a group called Charts. They're Vest's own page, logged in like yours. See [Multi-chart's tabs](#multi-charts-tabs).
- Voice commands (beta, off until you switch them on) use your microphone only in their own small window, and Chrome turns what you say into words on your computer. Your voice never leaves it. See [Voice commands](#voice-commands-beta).
- Orders go through Vest's own buttons, the same ones you click.
- The code is all in this repo, readable, exactly what's in the zip.

## What it can access

| Permission | Why |
|---|---|
| `storage` | To keep your settings and the update status. |
| `alarms` | For the update check every 30 minutes, the safety switches every 3 minutes, and the usage stats every 3 minutes (Standard and Lite). |
| `tabGroups` | For the copy trader and multi-chart. Turbo's hidden follower tabs go into one collapsed group per copy group (Copy A, Copy B), out of your way. A copy group whose leader isn't your tab's account gets a Vest tab of its own, in a group called Better Vest. Light doesn't use it when you start copying from the tab that's on the leader account. Multi-chart's hidden tabs go into a collapsed group called Charts. |
| Site access: `https://next.vestmarkets.com/*` | That's where the dock, the card and the chart tools live. It doesn't run on any other site. |

That's the full list. It can't read your browsing history or cookies, and it doesn't touch your other tabs or downloads. You can see the same list yourself on `chrome://extensions` → Better Vest → **Details**.

Three kinds of its own files can be loaded by the Vest page (Chrome calls them web-accessible): the voice's sound files (not in Lite), the two sounds of the price alerts, and the small page that shows the P&L card's pop-up. Only next.vestmarkets.com can load them. It also means Vest's page can tell that Better Vest is installed.

## Where it connects

Every address in the code, and when each one is used:

| Address | What for | When |
|---|---|---|
| `next.vestmarkets.com` | The page it adds its tools to. | While you have Vest open. |
| `ws.hz.vestmarkets.com` | Vest's public market feed: live trades, prices and the order book. | While you have Vest open. |
| `api-gateway.hz.vestmarkets.com` | Read-only (GET) requests: your trade history and payouts for the Calendar and the Payout card, open positions for the chart TP/SL and the copy trader, today's positions for the P&L card, the daily profit limit and the tilt guard, and your accounts' resting orders for the copy trader's limit-order mirror. They use the login your Vest tab already has and keep it in memory only, never on disk. The chart and the copy trader can only ask for positions, resting orders and market info. The copy trader's orders and Request payouts' claims go here too, but Vest's own code sends them, the same way it sends yours. | When the Calendar syncs, while you hold a position with chart TP/SL on, while copying is on, when you press P&L or the card pops up after a big close, and every 15 seconds while the daily profit limit or the tilt guard is on. |
| `api.github.com` | "Which version is the latest?" Nothing about you is in that request. | Every 30 minutes, and when Chrome starts. You can turn it off in the toolbar popup. |
| `raw.githubusercontent.com` | The files of a new version, from this repo. | Only when you click Update. |
| `bv.astrals.dev` | My site: the usage stats, and the safety switches. See [The usage stats](#the-usage-stats) and [Safety switches](#safety-switches). | The stats: once when it's installed or updated, every 3 minutes while a Vest tab is open, and every 10 minutes once you've said yes (Standard and Lite). The switches: every 3 minutes while a Vest tab is open. |
| `fonts.googleapis.com` | A font (the file itself comes from `fonts.gstatic.com`). | Only if you pick one of the Google fonts in Settings > Look. The default is Vest's own font, which loads nothing. |

There's no other address in the code. No ads, and no analytics company. The voice, the news dates and the P&L pop-up are files inside the extension. Multi-chart's hidden tabs are Vest's own page, so they make Vest's own requests, the same as any Vest tab you open.

## The usage stats

Standard and Lite send me anonymous usage stats, so I know how many people use Better Vest and what to make better. No stats sends nothing.

| | Standard and Lite | No stats |
|---|---|---|
| **When it's installed, updated or switched to** | the version and the edition | nothing |
| **Every 3 minutes while a Vest tab is open** | a random number, the version and the edition | nothing |
| **Every 10 minutes while a Vest tab is open, once you've said yes** | the same random number, how many times each of Better Vest's own features was used that day, and how Better Vest is set up | nothing |

- **The random number** is made on your computer the first time, with the browser's own random generator, and kept in the extension's storage. It isn't built from anything: not your Vest account, not your computer, not your address. It only lets me count the same person once. Removing the extension removes it, and so does switching to No stats.
- **Feature use and setup:** how many times a day Better Vest's own buttons and keys were used (like FLAT, a hotkey or the P&L card), and its settings (like the theme, where the Execute card sits, which options are on, which keys are set), plus how many accounts of each kind and size you have. When you buy a Vest plan, the purchase too, once it's paid: whether my code WICK, another code or no code was on, and the price after its discount. Never which plan, which account, your card or another code's name. Only names from a fixed list in the code (`update/count.js`), and my site checks them again and drops anything else. Never a price, a size, an account id, anything you type, or the time of day.
- **You're asked first:** after the update, a small note says what it sends and why. That part goes out only once you say yes, and Settings > More turns it off any time.
- **Where it goes:** `bv.astrals.dev/api/count`, my site, as one small request from the extension's background script. No cookies, and nothing is read back.
- **What I keep:** counts. Installs per version and edition, how many different numbers per day, and how many in the last 15 minutes, and for 40 days each computer's day of feature use and setup, under a scrambled form of its number. After that only daily totals stay: how many used each feature or picked each setting. The numbers themselves go into a form that can't be turned back into them, except the ones seen in the last 15 minutes, which is what "online now" counts.
- **What I never get:** your Vest account, trades, balances, P&L, positions, orders or the pages you open. Vercel, which hosts the site, sees the IP address of every request the way any website does; the stats don't keep it.
- **Don't want it?** Turn it off in Settings > More, or take the No stats zip (or switch to it on the update page). No stats sends nothing at all.

## Safety switches

If Vest changes something a feature depends on, or I find a bug, I can pause that one feature for everyone until it's fixed: the copy trader, Turbo, LONG / SHORT, FLAT / 50% / REV, stop orders, limit orders, TP / SL on the chart, the trailing stop, auto breakeven, account switching and payouts, the loss limit's "Close my positions", voice commands, or code WICK going into an empty code box.

- **How it works:** every 3 minutes while a Vest tab is open, the extension asks `bv.astrals.dev/api/flags` which features are paused. Nothing about you is in that request: no number, no account, no cookies.
- **What comes back:** a short list of feature names, my note on why, and the version the Chrome Web Store has. It's data, never code: Better Vest only reads names it knows and shows my note as plain text.
- **News from me** (since 9.2.6): the same answer can carry one short note, a title, a line of text and the times it shows. Better Vest shows it as plain text in a small card at the bottom right of Vest's page, only while you're flat and never over a Vest window. Its button can only open a page on Vest's own site. x closes it for good.
- **What you see:** a message with my note. A paused feature does nothing when you press it, and if it was running, it stops: copying stops (your followers keep their positions), armed stop orders pause and don't fire, and the trailing stop and auto breakeven stop moving your stop. You can always trade on Vest itself.
- **If my site is down:** nothing changes. Better Vest keeps the last answer it got.
- **What it never touches:** the order code itself, and the loss limit's lock.

## How it places orders

It doesn't have its own way to trade. It works the page the way you would:

- **LONG / SHORT:** fills in Vest's own order ticket (size, stop, target) and presses Vest's own Buy or Sell button. On NQ it first sets the ticket's size unit to NQ through Vest's own unit menu (Minis or Micros would change what the size means), and sends nothing if the unit won't change. With STOP or TARGET switched off on the card it leaves that leg out and empties its field. With both off it switches Vest's own TP/SL box off, and it sends nothing if the box won't go off.
- **FLAT, 50%, REV, and 10%, 25%, 75% or your own share (hover 50%):** use Vest's own close window, the one its Close button opens. If another tab of Vest's bottom panel is showing, they switch it to Active Positions first. When Vest asks one more question after a close (slippage, your account limits, or close orders already waiting), FLAT presses Vest's own confirm button, because FLAT is the panic button. 50%, REV and the other shares leave that to you. The other shares press Vest's own percentage button, or move Vest's own percentage slider when it has no button for that share, and check the size Vest's Close button shows before pressing it. Before any of them presses a percentage in that window, they set its size unit to the market's own through Vest's own unit menu (in Minis or Micros Vest rounds the percentage down to whole contracts), and put your unit back after.
- **Dragging TP or SL on the chart, and BE:** go through Vest's own TP/SL handler, the code Vest itself uses to change a take-profit or a stop.
- **Partials:** done in Vest's own Edit TP/SL window. It sets the shares, adds the targets and presses Apply, and checks every field before it does.
- **Trailing stop and auto breakeven:** once you switch them on, they move your stop through the same Vest TP/SL handler as dragging it, one change at a time, and only ever tighter. Drag the stop back yourself and trailing turns off for that position.
- **Stop orders:** a stop you arm on the chart stays in your tab. Vest doesn't see it until the price touches it; then it places a market order the same way LONG or SHORT does, once: with the card's stop and target if **SL/TP on Stop & Limit** is on, plain if it's off. If the price went past it while the tab was reloading or offline, it's marked PASSED and nothing is sent.

- **Limit orders from the chart (LIMIT):** fill in Vest's own order ticket on its Limit tab (size and the price you clicked) and press Vest's own Buy or Sell button, the way the E and Q hotkeys do, then put the ticket back on Market. A price the market already reached is refused.
- **Cancel all orders:** presses Vest's own Cancel button on each row of its Open Orders tab, and removes the stop orders it holds in your tab. It never presses the cancel button of a TP or SL, and never closes a position.
- **Other markets:** off NQ, LONG, SHORT, E, Q, LIMIT and STOP first put Vest's own size unit on that market's unit, through Vest's own toggle or drop-down.
- **Switch, in multi-chart:** when you press Switch, it moves the page to that market through Vest's own navigation, with no reload. It sends no order.

- **The copy trader:** calls Vest's own order code with each follower's account. See [The copy trader](#the-copy-trader).
- **Switching accounts from the account menu:** clicks that account's row in Vest's own account menu.
- **Add account and Log out in the account menu:** press the same items in Vest's own account menu. Log out takes two clicks, because Vest logs you out of every Vest tab.

Better Vest never builds a trading request of its own. Vest's code sends everything, exactly as if you'd clicked.

One more thing it does to your clicks: while a lock is on (your own lock, the daily loss limit, the daily profit limit or the tilt guard), it swallows a click on Vest's own Buy and Sell on your screen, until the lock runs out. **Also block Vest's own Buy and Sell** in Settings > Risk turns that off. It never blocks a close. With **Close my positions at the limit** on (the default), hitting the daily loss limit also closes every position of that account, one by one through Vest's own Close button and close window, the way FLAT does, and any position that opens on that account until Vest's day resets at 8 pm New York. The profit limit never closes anything.

The P&L card makes its image, its video and its GIF in your browser. For Replay it takes the candles from Vest's own chart, and for an older day, another market you traded that day, or a finer timeframe, it asks Vest's own chart code for them, the way the chart does when you scroll back. **My chart** takes the candle colors from your own chart's settings on the page. The image, video or GIF only leaves your computer if you post it. The pop-up after a big close is that small page of the extension inside Vest's page: it only draws the card it's given, and Save and Copy work on your computer.

And one thing it does to the chart by itself: while you hold a position, it widens TradingView's right margin just enough for the TP/SL labels, and puts it back when you're flat. Settings > TP/SL turns that off.

## The copy trader

It's off until you open it and switch it on. Then:

- **What it watches:** your leader account's positions and resting limit orders, in the data Vest already keeps on the page and in Vest's own live feed. It also watches Vest's own order system, read-only, to see the moment Vest accepts one of your orders, so it can copy right away. It never sends anything through it.
- **How it copies:** when a follower needs an order to match the leader, it calls Vest's own order functions (the ones Vest's order ticket, its Close window and its TP/SL windows call) with that follower's account. Vest's code gets that account's login for the order and sends it, exactly as if you'd traded that account yourself.
- **Copy groups:** you can have several groups, each with its own leader and followers. An account copies in one group at a time. A group whose leader isn't your tab's account copies from a Vest tab of its own: the extension opens it on that leader, in the Better Vest tab group, and keeps Chrome from freeing it. It never closes that tab, because you may trade in it. By default a follower sits out a trade that would put it on the opposite side to an account in another group, because Vest's rules forbid that on funded accounts.
- **Turbo:** one hidden Vest tab per follower, grouped and collapsed as "Copy" plus the group's letter. Each one is set to its follower account in that tab only, with Vest's own account switch, and without changing which account Vest opens by default for you. Your leader tab sends it what to copy through the extension itself (nothing leaves your computer for that), and the follower tab calls Vest's own order code for its own account. Vest only puts its functions for stops, targets and partial closes on a position's row and chart, which a hidden tab doesn't draw: when a follower's tab doesn't have one, your leader tab sends that order for the follower the way Light does (below). The tabs close when you switch copying off.
- **Light (the default): the account switch you don't see.** In Light mode everything runs from the group's leader tab. A new position names the follower's account directly. For everything else (adding, closing, TP and SL, limit orders), Vest's functions take the account from the page's active account. So for each of those orders Better Vest sets the follower as active, starts the order and sets the leader back, all in one step of the page's code. The screen never shows the follower.
- **Closing part of a copied position:** Vest's partial-close function only exists while its Close window is on the page. So once a follower holds a position, Better Vest opens that window for a moment (nothing is pressed in it) and closes it again, the same way it finds Vest's close and TP/SL functions.
- **Cancelling copied limit orders:** Vest's cancel function only exists while its Open Orders tab is on the page. So the first time a copied limit order may need cancelling after the page loads, Better Vest opens that tab for a moment and puts your previous tab back.
- **What it never does:** it never trades the leader account, never reads or keeps your login token, never changes an account setting (a follower's leverage comes from the leader's position, inside the order), never withdraws. It only ever cancels orders it placed itself.
- **Your say:** it asks once, before the first start, if you understand that it places real orders. Every start shows what it's about to do and waits for your OK. After a reload it only switches itself back on when copied positions are still open (and says so); otherwise it stays off. Alt+Shift+K stops every group at once; twice within five seconds also closes the followers' positions. Each group copies from one Vest tab at a time.
- **Keeping the tab awake:** Chrome slows down tabs in the background. While copying is on, the tab keeps itself awake with a data channel between two ends inside the same tab. It needs no server and nothing goes to the internet.
- **Its log:** it keeps a log of what it sent (accounts, markets, sizes, prices, timings, Vest's answer ids) in the extension's storage on your computer, the last 500 entries. No token, no password. **Export** in the copy trader saves it as a file, so you can check it or send it to me when something looks wrong.

## The voice

Not in Lite, which has none of it.

- It plays sound files that ship inside the extension. Nothing is sent anywhere, and no text is turned into speech online.
- To know what happened, it reads what Vest's own page already receives about your orders and positions, read-only.
- With several Vest tabs open, the tabs take turns through the browser (a Web Lock, on your computer), so each line is said once. The copy trader's tabs and multi-chart's tabs never speak.

## Voice commands (beta)

Off until you switch them on in Settings > Hotkeys. Not in the Tampermonkey script or on the phone.

- Vest's page isn't allowed to use a microphone, so Better Vest opens a small window of its own (`cert/listen.html`) when you click **Open the mic window**. Chrome asks you once whether Better Vest may use the microphone. The window listens only while it's open; close it and voice commands stop.
- What you say is turned into words by Chrome's own speech engine, on your computer (Chrome downloads that engine once). If Chrome can't do that on your computer, the window says so and does nothing. It never falls back to an online engine, and no sound or words are sent anywhere.
- A command does exactly what its hotkey or button does: LONG, SHORT, the limit orders, breakeven, FLAT, 50% and REV (said twice, like REV's two clicks). It goes only to the Vest trade tab in front, through the extension itself, never as a message other scripts on Vest's page could send. **Open trades by voice** in Settings turns off everything but closing and breakeven.
- With usage stats on (Standard and Lite), it counts how often the window opens, the minutes it listens, the seconds you hold the talk key, and how many commands it understood or missed, as numbers only, never words. That's how I'll know what a better engine would cost.
- I can switch voice commands off for everyone while a fix is made ([Safety switches](#safety-switches)).

## Multi-chart's tabs

- Each extra chart's market gets one Vest tab of its own (`/trade/<market>?bvChart=<market>`), opened next to yours, at most three, in a gray collapsed group called Charts. It's Vest's own page, logged in like your tab, and it feeds the chart.
- Chrome is told not to free these tabs, and they keep themselves awake the way the copy trader's tabs do, with a data channel between two ends inside the same tab. Nothing goes to the internet for that.
- They close when you go back to one chart, when a chart stops showing that market, or when you close the Vest tab that opened them.

## Request payouts

It's in Manage accounts, in the account menu, and does nothing until you press it.

- **First a check:** for each funded account, what it would claim and what you'd receive, or why it can't claim now. Vest refuses a claim while the account holds a position or an order, so those are left out. Nothing happens until you press **Claim**.
- **Then one account at a time:** Vest's own account menu switches to it, Vest's own Claim profit button opens Vest's window (on its Portfolio page), 100% goes in, and Vest's own Claim button sends it. The claim goes where Vest's window sends it, to your Primary account. Better Vest never types an address or picks where the money goes.
- **It stops** at the first refusal and tells you which account and why, and **Stop after this account** stops it by hand. Then it brings back the account and the page you were on.
- It won't start while any copy group is copying, while a stop order is armed, while the loss limit is closing positions, or while the Execute card is sending an order, because a claim switches accounts.

## The WICK code

This is how Better Vest stays free.

- **An empty code box** (since 9.2.6): when a purchase screen opens and Vest's code box has no code in it, Better Vest puts WICK in through Vest's own box and Vest's own button, once per purchase, and a note says so. Nothing is bought by it. It never replaces a code that is on, and if you press into the code box first, the box is yours. Switch it off with **Put code WICK in when Vest's code box is empty** in Settings > More > Support Astral. It's also off if you turned the question off. In the Chrome Web Store version it waits for your yes: that switch, or Always use code WICK.
- **The question:** when you press Purchase Evaluation Account, Buy Your Bespoke Account, Add Funded Account or Buy Without a Discount, while you're logged in and another code is on. Your press waits, and a pop-up asks.
- **Use code WICK** puts WICK in Vest's own code box and presses Vest's own button for it. If Vest takes it and the discount is the same or more, your purchase goes on: Better Vest presses your button once more. If not, your code goes back, the pop-up says so, and nothing goes on until you press again.
- **No thanks**, or pressing the button again, goes on at once, as it was.
- **Always use code WICK** (off until you switch it on) skips the question: your press puts WICK in and goes on. It never replaces a code you typed or picked in that purchase, and never keeps WICK when it gives less off.
- When something is unsure (no code box, or no answer from Vest within a few seconds), your press goes through as it was.
- The pop-up has one of three looks, picked once on each computer: your month with Better Vest (counted on this computer only), the plan's price from Vest's own card with and without WICK, or a short note from me.
- **Settings > More > Support Astral** has the switches: **Ask about code WICK when I buy**, **Put code WICK in when Vest's code box is empty** and **Always use code WICK**.

With WICK you pay the same or less, and the purchase supports me.

## What stays on your computer

- Your settings, in Chrome's storage for the extension and in the Vest page's own storage.
- Your Calendar history, in the browser's database on this computer.
- If you turn on the daily loss limit, the Account Value it first saw each day, per account (`ax4p_dll` in the Vest page's storage). It reads the number from the page you're looking at and never asks Vest for it.
- Stop orders you've armed, with your other settings, so a reload doesn't lose them, and the ids of stops you removed, so another Vest tab can't bring them back.
- The P&L card's look (theme, style, size, what shows) in its own page's storage, and the numbers for the card you opened in Chrome's session storage, which Chrome clears when it closes.
- If you use the copy trader: its settings (groups, leaders, followers, ratios, the markets it copies, the ids of limit orders it placed) with your other settings, and its log in Chrome's storage for the extension.
- The account menu's nicknames, pins and hidden accounts, and whether the limits panel is open, with your other settings. For accounts Vest gives no daily reset for, each account's first value of the trading day (`ax4p_vu_day` in the Vest page's storage), read from the page.
- The price of every second while a Vest trade page is open, for the P&L card's replays, in the extension's own database, kept for 30 days (under 1 MB a day for a market). Settings > More > P&L card turns it off.
- Your own picture or GIF for the P&L card's background, in the extension's own database, until you remove it.
- Locks and the tilt guard's cooldown, with the loss limit's numbers (`ax4p_dll`). The profit limit and the tilt guard read your closed trades from Vest each time and keep no history of them.
- Multi-chart's layout and each chart's drawings, with your other settings.
- Price alerts you set (market, price, which way), with your other settings, until they ring or you remove them.
- Voice commands' settings with your other settings, and where you last put the mic window, in Chrome's storage for the extension.
- For the WICK pop-up: how many one-click entries you made this month and on which days (`ax4p-wick-tally` in the Vest page's storage, for one of its looks), and the discount Vest last gave for WICK (`ax4p-wick-pct`).
- For one-click updates: a link to the folder you picked, so Chrome can write the new files there.
- For the usage stats (Standard and Lite): the last version and edition it counted, the random number, your answer to the note, and the day's counts until they go out.
- For the safety switches: the last answer from my site.

None of it is sent anywhere, except what the usage stats send (above). Removing the extension removes its storage. The copy of your settings in the Vest page's storage goes when you clear that site's data.

## Updates are signed

Chrome only updates extensions that come from the Chrome Web Store. Better Vest is loaded from a folder, so it has its own updater. It checks for a new version by itself, but it only writes after you click Update, only into the folder you picked, and only files that match my signature.

Every release comes with `files.json`, a list of every file with its SHA-256 hash, plus a signature. I make the signature on my own computer with a key that never leaves it. The public half is in the extension (`update/key.js`).

When you click Update, Better Vest:
1. downloads every file;
2. checks the signature and every hash;
3. writes the files only if all of it matches.

If anything is off, nothing changes. If writing fails halfway, the old files go back. **Settings > More > About > Check for updates** opens the update page any time.

Your copy stays the edition it is. The update page can also switch it to another one (Standard, Lite or No stats), even at the same version: the same checks, from that edition's own folder in this repo, and the files the new edition doesn't have are removed.

When a new version is out and you're flat, a small panel at the bottom right of Vest's page says what's new, at most once a day, in one tab. **Later** closes it. It never shows while you hold a position or Vest has a window open.

## Check it yourself

1. **Read the code.** The [`extension`](extension) folder in this repo is the Standard zip, file for file ([`extension-lite`](extension-lite) and [`extension-nostats`](extension-nostats) are the other two). It isn't minified or obfuscated, so you can read it in your browser.
2. **Check the zip is that code.** The SHA-256 of `better-vest-9.3.2.zip` is:

   `8584d0882f304664573b6f9b5ef76e45ae855b1f776ecdb05ae5e4813b493525`

   Lite: `1a3aca332b6fea94d0c272ce4afb752d8b408351fbf59604c74ecdf982cbe55b`. No stats: `be3647157d1ccf4b12c080311ae620d3f1aa60b79d0ce3cc91d8d96115cfe091`.

   - On Mac: `shasum -a 256 better-vest-9.3.2.zip`
   - On Windows: `certutil -hashfile better-vest-9.3.2.zip SHA256`
3. **Scan it.** VirusTotal checks a file with more than 60 antivirus engines. Upload the zip at [virustotal.com](https://www.virustotal.com) and you get the result for that exact file. The version here, 9.3.2, came back with no engine flagging it: Standard ([report](https://www.virustotal.com/gui/file/8584d0882f304664573b6f9b5ef76e45ae855b1f776ecdb05ae5e4813b493525)), Lite ([report](https://www.virustotal.com/gui/file/1a3aca332b6fea94d0c272ce4afb752d8b408351fbf59604c74ecdf982cbe55b)), No stats ([report](https://www.virustotal.com/gui/file/be3647157d1ccf4b12c080311ae620d3f1aa60b79d0ce3cc91d8d96115cfe091)). The one released before, 9.3.1, was the same.

   Reports for earlier versions also had an AI summary, "Code insights", which marked two things as suspicious. Both are on this page: the WICK code switch ([The WICK code](#the-wick-code)) and the updater writing its own files ([Updates are signed](#updates-are-signed)).
4. **Watch it work.** Open Chrome's DevTools on the Vest tab (F12), go to Network, and use Better Vest. You'll only see the addresses listed above.

## Who makes it

Me, Astral (Discord **@ax4p**). I trade NQ on Vest every day and built this for my own screen first. It's not made by Vest and has no connection to Vest Markets.

If you find something that looks wrong, tell me on Discord. I'd rather hear it than not.
