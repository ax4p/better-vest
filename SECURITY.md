# Is Better Vest safe?

People keep asking, and they should. Anything that sits next to your trading account deserves the question. This page says exactly what Better Vest can do, what it can't, and how you can check every part of that yourself. Nothing here is a promise you have to take my word for.

## The short version

- It only runs on next.vestmarkets.com.
- It asks Chrome for three permissions, `storage`, `alarms` and `tabGroups`, and nothing else.
- It has no server and sends me nothing: no data, no stats, no account details.
- It never sees your password or your wallet's keys, and never stores your Vest login. (Read-only requests, like the Calendar reading your trade history, borrow the login your Vest tab already has, in memory. The copy trader's own code never touches it.)
- It never withdraws, never changes account settings, never creates anything. The one account action it has is **Request payouts**: when you press it and confirm, it claims profit from your funded accounts to your Primary account through Vest's own Claim profit window. See [Request payouts](#request-payouts).
- The copy trader is off until you switch it on. Then it copies your leader account's trades to your other Vest accounts through Vest's own order code. See [The copy trader](#the-copy-trader).
- Some tools act on their own once you switch them on: the copy trader, a trailing stop or auto breakeven moving your stop (only ever tighter), and a stop order you armed sending its order when the price gets there. See [How it places orders](#how-it-places-orders).
- The one thing it does without you switching anything on: at checkout it switches Vest's default discount code VEST to my code WICK, and only keeps it when you get the same discount or more. You can turn that off. See [The WICK code](#the-wick-code).
- Orders go through Vest's own buttons, the same ones you click.
- The code is all in this repo, readable, exactly what's in the zip.

## What it can access

| Permission | Why |
|---|---|
| `storage` | To keep your settings and the update status. |
| `alarms` | For the update check every 30 minutes. |
| `tabGroups` | Only for the copy trader. Turbo's hidden follower tabs go into one collapsed group per copy group (Copy A, Copy B), out of your way. A copy group whose leader isn't your tab's account gets a Vest tab of its own, in a group called Better Vest. Light doesn't use it when you start copying from the tab that's on the leader account. |
| Site access: `https://next.vestmarkets.com/*` | That's where the dock, the card and the chart tools live. It doesn't run on any other site. |

That's the full list. It can't read your browsing history or cookies, and it doesn't touch your other tabs or downloads. You can see the same list yourself on `chrome://extensions` → Better Vest → **Details**.

## Where it connects

Every address in the code, and when each one is used:

| Address | What for | When |
|---|---|---|
| `next.vestmarkets.com` | The page it adds its tools to. | While you have Vest open. |
| `ws.hz.vestmarkets.com` | Vest's public market feed: live trades, prices and the order book. | While you have Vest open. |
| `api-gateway.hz.vestmarkets.com` | Read-only (GET) requests: your trade history for the Calendar, open positions for the chart TP/SL and the copy trader, today's positions for the P&L card, and your accounts' resting orders for the copy trader's limit-order mirror. They use the login your Vest tab already has and keep it in memory only, never on disk. The chart and the copy trader can only ask for positions, resting orders and market info. The copy trader's orders and Request payouts' claims go here too, but Vest's own code sends them, the same way it sends yours. | When the Calendar syncs, while you hold a position with chart TP/SL on, while copying is on, and when you press P&L. |
| `api.github.com` | "Which version is the latest?" Nothing about you is in that request. | Every 30 minutes, and when Chrome starts. You can turn it off in the toolbar popup. |
| `raw.githubusercontent.com` | The files of a new version, from this repo. | Only when you click Update. |
| `fonts.googleapis.com` | A font. | Only if you pick one of the Google fonts in Settings > Look. The default is Vest's own font, which loads nothing. |

There's no other address in the code. No analytics, no tracking, no ads.

## How it places orders

It doesn't have its own way to trade. It works the page the way you would:

- **LONG / SHORT:** fills in Vest's own order ticket (size, stop, target) and presses Vest's own Buy or Sell button. With STOP or TARGET switched off on the card it leaves that leg out and empties its field. With both off it switches Vest's own TP/SL box off, and it sends nothing if the box won't go off.
- **FLAT, 50%, REV:** use Vest's own close window, the one its Close button opens. If another tab of Vest's bottom panel is showing, they switch it to Active Positions first. When Vest asks one more question after a close (slippage, your account limits, or close orders already waiting), FLAT presses Vest's own confirm button, because FLAT is the panic button. 50% and REV leave that to you.
- **Dragging TP or SL on the chart, and BE:** go through Vest's own TP/SL handler, the code Vest itself uses to change a take-profit or a stop.
- **Partials:** done in Vest's own Edit TP/SL window. It sets the shares, adds the targets and presses Apply, and checks every field before it does.
- **Trailing stop and auto breakeven:** once you switch them on, they move your stop through the same Vest TP/SL handler as dragging it, one change at a time, and only ever tighter. Drag the stop back yourself and trailing turns off for that position.
- **Stop orders:** a stop you arm on the chart stays in your tab. Vest doesn't see it until the price touches it; then it places a market order the same way LONG or SHORT does, once: with the card's stop and target if **SL/TP on Stop & Limit** is on, plain if it's off. If the price went past it while the tab was reloading or offline, it's marked PASSED and nothing is sent.

- **Limit orders from the chart (LIMIT):** fill in Vest's own order ticket on its Limit tab (size and the price you clicked) and press Vest's own Buy or Sell button, the way the E and Q hotkeys do, then put the ticket back on Market. A price the market already reached is refused.
- **Cancel all orders:** presses Vest's own Cancel button on each row of its Open Orders tab, and removes the stop orders it holds in your tab. It never presses the cancel button of a TP or SL, and never closes a position.

- **The copy trader:** calls Vest's own order code with each follower's account. See [The copy trader](#the-copy-trader).
- **Switching accounts from the account menu:** clicks that account's row in Vest's own account menu.

Better Vest never builds a trading request of its own. Vest's code sends everything, exactly as if you'd clicked.

One more thing it does to your clicks: with the daily loss limit on and hit, it can swallow a click on Vest's own Buy and Sell on your screen, until the reset hour. You can turn that option off in Settings > Risk. It never blocks a close. With **Close my positions at the limit** on (the default), hitting the limit also closes every position of that account, one by one through Vest's own Close button and close window, the way FLAT does, and any position that opens on that account until the reset hour.

The P&L card makes its image and its video in your browser. For Replay it takes the candles from Vest's own chart, and for an older day, another market you traded that day, or a finer timeframe, it asks Vest's own chart code for them, the way the chart does when you scroll back. **My chart** takes the candle colors from your own chart's settings on the page. The image or video only leaves your computer if you post it.

And one thing it does to the chart by itself: while you hold a position, it widens TradingView's right margin just enough for the TP/SL labels, and puts it back when you're flat. Settings > TP/SL turns that off.

## The copy trader

It's off until you open it and switch it on. Then:

- **What it watches:** your leader account's positions and resting limit orders, in the data Vest already keeps on the page and in Vest's own live feed. It also watches Vest's own order system, read-only, to see the moment Vest accepts one of your orders, so it can copy right away. It never sends anything through it.
- **How it copies:** when a follower needs an order to match the leader, it calls Vest's own order functions (the ones Vest's order ticket, its Close window and its TP/SL windows call) with that follower's account. Vest's code gets that account's login for the order and sends it, exactly as if you'd traded that account yourself.
- **Copy groups:** you can have several groups, each with its own leader and followers. An account copies in one group at a time. A group whose leader isn't your tab's account copies from a Vest tab of its own: the extension opens it on that leader, in the Better Vest tab group, and keeps Chrome from freeing it. It never closes that tab, because you may trade in it. By default a follower sits out a trade that would put it on the opposite side to an account in another group, because Vest's rules forbid that on funded accounts.
- **Turbo:** one hidden Vest tab per follower, grouped and collapsed as "Copy" plus the group's letter. Each one is set to its follower account in that tab only, with Vest's own account switch, and without changing which account Vest opens by default for you. Your leader tab sends it what to copy through the extension itself (nothing leaves your computer for that), and the follower tab calls Vest's own order code for its own account. The tabs close when you switch copying off.
- **Light (the default): the account switch you don't see.** In Light mode everything runs from the group's leader tab. A new position names the follower's account directly. For everything else (adding, closing, TP and SL, limit orders), Vest's functions take the account from the page's active account. So for each of those orders Better Vest sets the follower as active, starts the order and sets the leader back, all in one step of the page's code. The screen never shows the follower.
- **Cancelling copied limit orders:** Vest's cancel function only exists while its Open Orders tab is on the page. So the first time a copied limit order may need cancelling after the page loads, Better Vest opens that tab for a moment and puts your previous tab back.
- **What it never does:** it never trades the leader account, never reads or keeps your login token, never changes an account setting (a follower's leverage comes from the leader's position, inside the order), never withdraws. It only ever cancels orders it placed itself.
- **Your say:** it asks once, before the first start, if you understand that it places real orders. Every start shows what it's about to do and waits for your OK. After a reload it only switches itself back on when copied positions are still open (and says so); otherwise it stays off. Alt+Shift+K stops every group at once; twice within five seconds also closes the followers' positions. Each group copies from one Vest tab at a time.
- **Keeping the tab awake:** Chrome slows down tabs in the background. While copying is on, the tab keeps itself awake with a data channel between two ends inside the same tab. It needs no server and nothing goes to the internet.
- **Its log:** it keeps a log of what it sent (accounts, markets, sizes, prices, timings, Vest's answer ids) in the extension's storage on your computer, the last 500 entries. No token, no password. **Export** in the copy trader saves it as a file, so you can check it or send it to me when something looks wrong.

## Request payouts

It's in Manage accounts, in the account menu, and does nothing until you press it.

- **First a check:** for each funded account, what it would claim and what you'd receive, or why it can't claim now. Vest refuses a claim while the account holds a position or an order, so those are left out. Nothing happens until you press **Claim**.
- **Then one account at a time:** Vest's own account menu switches to it, Vest's own Claim profit button opens Vest's window (on its Portfolio page), 100% goes in, and Vest's own Claim button sends it. The claim goes where Vest's window sends it, to your Primary account. Better Vest never types an address or picks where the money goes.
- **It stops** at the first refusal and tells you which account and why, and **Stop after this account** stops it by hand. Then it brings back the account and the page you were on.
- It won't start while any copy group is copying, while a stop order is armed, while the loss limit is closing positions, or while the Execute card is sending an order, because a claim switches accounts.

## The WICK code

This is how Better Vest stays free, and it's the one thing it does without you pressing a button.

- On Vest's purchase screens, a small card suggests my code **WICK**. **Use WICK** puts it in Vest's own discount field and presses Vest's own **Use** button.
- When Vest has filled in its own default code **VEST**, Better Vest switches it to WICK by itself, once each time the page loads, where you can see it. It keeps WICK only if Vest shows the same discount or more. Otherwise VEST goes back.
- A code you typed or picked yourself is never touched.
- **Undo** on the card puts VEST back and turns the switch off. **Settings > More > Support Astral** turns it on or off.

With WICK you pay the same or less, and the purchase supports me.

## What stays on your computer

- Your settings, in Chrome's storage for the extension and in the Vest page's own storage.
- Your Calendar history, in the browser's database on this computer.
- If you turn on the daily loss limit, the Account Value it first saw each day, per account (`ax4p_dll` in the Vest page's storage). It reads the number from the page you're looking at and never asks Vest for it.
- Stop orders you've armed, with your other settings, so a reload doesn't lose them, and the ids of stops you removed, so another Vest tab can't bring them back.
- The P&L card's look (theme, style, size, what shows) in its own page's storage, and the numbers for the card you opened in Chrome's session storage, which Chrome clears when it closes.
- If you use the copy trader: its settings (groups, leaders, followers, ratios, the markets it copies, the ids of limit orders it placed) with your other settings, and its log in Chrome's storage for the extension.
- The account menu's nicknames, pins and hidden accounts, and whether the limits panel is open, with your other settings. For accounts Vest gives no daily reset for, each account's first value of the trading day (`ax4p_vu_day` in the Vest page's storage), read from the page.
- For one-click updates: a link to the folder you picked, so Chrome can write the new files there.

None of it is sent anywhere. Removing the extension removes its storage. The copy of your settings in the Vest page's storage goes when you clear that site's data.

## Updates are signed

Chrome only updates extensions that come from the Chrome Web Store. Better Vest is loaded from a folder, so it has its own updater. It checks for a new version by itself, but it only writes after you click Update, only into the folder you picked, and only files that match my signature.

Every release comes with `files.json`, a list of every file with its SHA-256 hash, plus a signature. I make the signature on my own computer with a key that never leaves it. The public half is in the extension (`update/key.js`).

When you click Update, Better Vest:
1. downloads every file;
2. checks the signature and every hash;
3. writes the files only if all of it matches.

If anything is off, nothing changes. If writing fails halfway, the old files go back.

## Check it yourself

1. **Read the code.** The [`extension`](extension) folder in this repo is the zip, file for file. It isn't minified or obfuscated, so you can read it in your browser.
2. **Check the zip is that code.** The SHA-256 of `better-vest-8.2.0.zip` is:

   `b949d5355c3272b4b9a0c41741051d6598351184499324a6e1ec6194211c8737`

   - On Mac: `shasum -a 256 better-vest-8.2.0.zip`
   - On Windows: `certutil -hashfile better-vest-8.2.0.zip SHA256`
3. **Scan it.** VirusTotal checks a file with more than 60 antivirus engines. Upload the zip at [virustotal.com](https://www.virustotal.com) and you get the result for that exact file. The last version I scanned there, 8.2.0, came back with 0 of 66 engines flagging it ([report](https://www.virustotal.com/gui/file/b949d5355c3272b4b9a0c41741051d6598351184499324a6e1ec6194211c8737)). The one before, 8.1.5, was 0 of 66 too ([report](https://www.virustotal.com/gui/file/2fc074e74f942cf09cbd6ec7a615eb7318f2820f8a6b2b0b94d2c72b49067bc9)).

   Reports for earlier versions also had an AI summary, "Code insights", which marked two things as suspicious. Both are on this page: the WICK code switch ([The WICK code](#the-wick-code)) and the updater writing its own files ([Updates are signed](#updates-are-signed)).
4. **Watch it work.** Open Chrome's DevTools on the Vest tab (F12), go to Network, and use Better Vest. You'll only see the addresses listed above.

## Who makes it

Me, Astral (Discord **@ax4p**). I trade NQ on Vest every day and built this for my own screen first. It's not made by Vest and has no connection to Vest Markets.

If you find something that looks wrong, tell me on Discord. I'd rather hear it than not.
