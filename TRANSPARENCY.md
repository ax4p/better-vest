# Is Better Vest safe?

People keep asking, and they should. Anything that sits next to your trading account deserves the question. This page says exactly what Better Vest can do, what it can't, and how you can check every part of that yourself. Nothing here is a promise you have to take my word for.

## The short version

- It only runs on next.vestmarkets.com.
- It asks Chrome for two permissions, `storage` and `alarms`, and nothing else.
- It has no server and sends me nothing: no data, no stats, no account details.
- It never sees your password or your wallet's keys, and never stores your Vest login. (The Calendar borrows the login your Vest tab already has, in memory, to read your trade history.)
- It never withdraws, never changes account settings, never creates or claims anything.
- The one thing it does by itself: at checkout it switches Vest's default discount code VEST to my code WICK, and only keeps it when you get the same discount or more. You can turn that off. See [The WICK code](#the-wick-code).
- Orders go through Vest's own buttons, the same ones you click.
- The code is all in this repo, readable, exactly what's in the zip.

## What it can access

| Permission | Why |
|---|---|
| `storage` | To keep your settings and the update status. |
| `alarms` | For the update check every 30 minutes. |
| Site access: `https://next.vestmarkets.com/*` | That's where the dock, the card and the chart tools live. It doesn't run on any other site. |

That's the full list. It can't read your browsing history or cookies, and it doesn't touch your other tabs or downloads. You can see the same list yourself on `chrome://extensions` → Better Vest → **Details**.

## Where it connects

Every address in the code, and when each one is used:

| Address | What for | When |
|---|---|---|
| `next.vestmarkets.com` | The page it adds its tools to. | While you have Vest open. |
| `ws.hz.vestmarkets.com` | Vest's public market feed: live trades, prices and the order book. | While you have Vest open. |
| `api-gateway.hz.vestmarkets.com` | Your trade history for the Calendar, read-only (GET requests). It uses the login your Vest tab already has and keeps it in memory only, never on disk. | When the Calendar syncs. |
| `api.github.com` | "Which version is the latest?" Nothing about you is in that request. | Every 30 minutes, and when Chrome starts. You can turn it off in the toolbar popup. |
| `raw.githubusercontent.com` | The files of a new version, from this repo. | Only when you click Update. |
| `fonts.googleapis.com` | A font. | Only if you pick one of the Google fonts in Settings > Theme. The default is Vest's own font, which loads nothing. |

There's no other address in the code. No analytics, no tracking, no ads.

## How it places orders

It doesn't have its own way to trade. It works the page the way you would:

- **LONG / SHORT:** fills in Vest's own order ticket (size, stop, target) and presses Vest's own Buy or Sell button.
- **FLAT, 50%, REV:** use Vest's own close window, the one its Close button opens.
- **Dragging TP or SL on the chart, and BE:** go through Vest's own TP/SL handler, the code Vest itself uses to change a take-profit or a stop.
- **Partials:** done in Vest's own Edit TP/SL window. It sets the shares, adds the targets and presses Apply, and checks every field before it does.

Better Vest never builds a trading request of its own. Vest's code sends everything, exactly as if you'd clicked.

With the demo position on (Alt+Shift+D), every button on the card only tells you what it would do. Nothing is sent.

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
2. **Check the zip is that code.** The SHA-256 of `better-vest-7.5.2.zip` is:

   `ac21bdf8646485810fa89758a58297e0290bcb0f7e305050ba7a52c558ae9ceb`

   - On Mac: `shasum -a 256 better-vest-7.5.2.zip`
   - On Windows: `certutil -hashfile better-vest-7.5.2.zip SHA256`
3. **Scan it.** VirusTotal checks a file with more than 60 antivirus engines. Here's the result for that exact zip: [VirusTotal report](https://www.virustotal.com/gui/file/ac21bdf8646485810fa89758a58297e0290bcb0f7e305050ba7a52c558ae9ceb) (0 of 65 engines flagged it, scanned 4 October 2026). You can also upload the zip there yourself.

   The report also has an AI summary, "Code insights", which marks two things as suspicious. Both are on this page: the WICK code switch ([The WICK code](#the-wick-code)) and the updater writing its own files ([Updates are signed](#updates-are-signed)).
4. **Watch it work.** Open Chrome's DevTools on the Vest tab (F12), go to Network, and use Better Vest. You'll only see the addresses listed above.

## Who makes it

Me, Astral (Discord **@ax4p**). I trade NQ on Vest every day and built this for my own screen first. It's not made by Vest and has no connection to Vest Markets.

If you find something that looks wrong, tell me on Discord. I'd rather hear it than not.
