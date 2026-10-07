/**
 * WhatsApp worker (Baileys).
 *
 * Connects as a linked device - the same mechanism as WhatsApp Web - which is
 * the only way to reach a real WhatsApp group. The Cloud API cannot join one.
 *
 * This process is deliberately thin: it moves messages between WhatsApp and
 * the app's /api/agent/message endpoint and holds no logic of its own. All the
 * behaviour (allowlist, task extraction, the agent, the budget cap) stays in
 * one place.
 *
 * It needs a permanently open socket, so it cannot run on Vercel. Run it on a
 * laptop to try it, or on a small always-on box to keep it.
 *
 *   node worker/whatsapp.mjs
 */
import { Boom } from "@hapi/boom";
// Baileys 6.x ships CommonJS, so importing it from an ES module puts the
// factory on `.default`. Unwrapping here keeps this working across both.
import baileys from "@whiskeysockets/baileys";
const {
  default: makeWASocketDefault,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
} = baileys;
const makeWASocket = makeWASocketDefault ?? baileys;
import qrcode from "qrcode-terminal";
import qrpng from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

// Read .env.local without a dotenv dependency.
for (const file of [".env.local", ".env"]) {
  const p = path.join(projectRoot, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const APP_URL = process.env.AGENT_API_URL ?? "http://localhost:3000";
const SECRET = process.env.AGENT_API_SECRET;
const CREW = (process.env.CREW_WHATSAPP_NUMBERS ?? "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
/** Group to listen in. Empty means direct messages only. */
const GROUP_ID = process.env.CREW_GROUP_ID ?? "";
const AUTH_DIR = path.join(projectRoot, ".whatsapp-auth");
/**
 * Pair with an 8-digit code instead of a QR.
 *
 * A QR has to be scanned by a *different* device than the one showing it, which
 * is impossible when the only screen is the phone being linked. With a number
 * here, WhatsApp accepts a typed code instead: Linked Devices -> Link a device
 * -> "Link with phone number instead".
 */
const PAIR_NUMBER = (process.env.PAIR_NUMBER ?? "").replace(/[^0-9]/g, "");
/**
 * LID -> phone number, as "lid=phone,lid=phone".
 *
 * WhatsApp now addresses senders by an opaque @lid instead of their number,
 * and this Baileys version carries no mapping: the message key holds the LID
 * and nothing else. So the allowlist never matched and every message from the
 * crew was dropped as a stranger.
 *
 * A LID is stable per account, so aliasing one to a number is exactly as
 * restrictive as listing the number was. Resolving here rather than in the app
 * means the server keeps seeing real phone numbers and needs no changes.
 */
const CREW_ALIASES = Object.fromEntries(
  (process.env.CREW_ALIASES ?? "")
    .split(",")
    .map((pair) => pair.split("=").map((x) => x.replace(/[^0-9]/g, "")))
    .filter(([lid, phone]) => lid && phone)
);

/** Write each QR to this path as a PNG, for sending to the person pairing. */
const QR_PNG = process.env.QR_PNG ?? "";

/**
 * Whether any socket in this process has reached a live connection.
 *
 * Once it has, the stored credentials are known good, and NOTHING short of an
 * explicit logout should delete them. A transient close - a 408 from a slow
 * init query, a dropped wifi - used to fall through to the "pairing expired"
 * branch and wipe a working pairing, forcing a fresh QR scan. That cost two
 * confirmed-good pairings before it was spotted.
 */
let everConnected = false;

if (!SECRET) {
  console.error("AGENT_API_SECRET is not set. Add it to .env.local and to Vercel.");
  process.exit(1);
}
if (CREW.length === 0) {
  console.error("CREW_WHATSAPP_NUMBERS is not set, so every sender would be rejected.");
  process.exit(1);
}

/** "972544373481@s.whatsapp.net" -> "972544373481" */
const toNumber = (jid) => (jid ?? "").split("@")[0].split(":")[0];

function readText(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    ""
  ).trim();
}

async function askAgent({ from, text, isGroup, extractOnly }) {
  const res = await fetch(`${APP_URL}/api/agent/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ from, text, isGroup, extractOnly }),
  });

  if (!res.ok) {
    console.error(`Agent endpoint returned ${res.status}: ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return { reply: data.reply ?? null, outbox: data.outbox ?? [] };
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  // fetchLatestBaileysVersion() reports a hardcoded version and claims it is
  // current; it was several builds behind here. Advertising a stale client
  // version is one of the documented reasons WhatsApp refuses to link a
  // device. Ask WhatsApp what the real current version is, and only fall back
  // to the bundled constant if that lookup fails.
  let version;
  try {
    if (typeof fetchLatestWaWebVersion === "function") {
      ({ version } = await fetchLatestWaWebVersion());
    } else {
      ({ version } = await fetchLatestBaileysVersion());
    }
  } catch {
    ({ version } = await fetchLatestBaileysVersion());
  }
  console.log(`Using WhatsApp Web version ${version.join(".")}`);

  const sock = makeWASocket({
    version,
    auth: state,
    // Printing the QR ourselves; the built-in flag is deprecated.
    printQRInTerminal: false,
    // Must be a browser/platform combination WhatsApp recognises. A custom
    // name here ("MyCrew") makes WhatsApp reject the pairing code with a
    // generic "Couldn't link device" while the socket sees no error at all.
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    // Default is 60s for the first QR and 20s for each one after. That is far
    // too short when the QR has to travel to whoever is holding the phone:
    // it has already expired by the time they open it. Each refresh also burns
    // one of a small pool of refs, so slower rotation makes the pool last.
    qrTimeout: 120_000,
  });

  sock.ev.on("creds.update", saveCreds);

  // DEBUG_FRAMES=1 logs every node WhatsApp sends. Pairing fails silently -
  // the phone says "Couldn't link device" while the socket reports nothing at
  // all - so without this there is nothing to diagnose from.
  if (process.env.DEBUG_FRAMES) {
    sock.ws.on("frame", (frame) => {
      if (!frame?.tag) return;
      const attrs = frame.attrs ?? {};
      const kids = (frame.content ?? [])
        .map((c) => (typeof c === "object" && c?.tag ? c.tag : null))
        .filter(Boolean);
      console.log(
        `[frame] <${frame.tag}${Object.entries(attrs)
          .map(([k, v]) => ` ${k}="${v}"`)
          .join("")}>` + (kids.length ? `  children: ${kids.join(", ")}` : "")
      );
    });
  }

  // Must be requested after the socket exists but before it is registered.
  if (PAIR_NUMBER && !sock.authState.creds.registered) {
    // Baileys rejects the request if it arrives before the connection settles.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PAIR_NUMBER);
        const pretty = code.match(/.{1,4}/g)?.join("-") ?? code;
        console.log("\n" + "=".repeat(46));
        console.log(`  PAIRING CODE:  ${pretty}`);
        console.log("=".repeat(46));
        console.log("  On your phone:");
        console.log("   WhatsApp -> Settings -> Linked Devices");
        console.log("   -> Link a device -> Link with phone number instead");
        console.log(`   -> enter ${pretty}`);
        console.log("=".repeat(46) + "\n");
      } catch (e) {
        console.error("Could not get a pairing code:", e?.message ?? e);
        console.error("Falling back to the QR above.");
      }
    }, 3000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // With PAIR_NUMBER set the code path is used instead; printing a QR too
    // would just be noise on a phone.
    if (qr && !PAIR_NUMBER) {
      console.log("\nScan this with WhatsApp -> Settings -> Linked Devices -> Link a device\n");
      qrcode.generate(qr, { small: true });

      // Also write a PNG. A terminal QR is unscannable when whoever runs this
      // is not the person holding the phone, and each refresh overwrites the
      // same path so the file always holds the QR currently valid.
      if (QR_PNG) {
        qrpng
          .toFile(QR_PNG, qr, { width: 512, margin: 2 })
          .then(() => console.log(`[qr] written to ${QR_PNG} at ${new Date().toLocaleTimeString()}`))
          .catch((e) => console.warn("[qr] could not write PNG:", e.message));
      }
    }

    if (connection === "open") {
      everConnected = true;
      const me = toNumber(sock.user?.id);
      console.log(`\nConnected as ${me}`);
      console.log(`Crew: ${CREW.join(", ")}`);
      console.log(GROUP_ID ? `Listening in group ${GROUP_ID}` : "Direct messages only (CREW_GROUP_ID not set)");
      // LID DIAG: ask WhatsApp what it knows about each crew number, to see
      // whether it hands back a LID we could map the allowlist onto.
      for (const n of CREW) {
        sock
          .onWhatsApp(n)
          .then((r) => console.log(`  onWhatsApp(${n}) -> ${JSON.stringify(r)}`))
          .catch((e) => console.log(`  onWhatsApp(${n}) failed: ${e.message}`));
      }
      console.log("Waiting for messages...\n");
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const registered = sock.authState.creds.registered;

      if (loggedOut) {
        // The session is dead; reusing these credentials just fails again.
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log(`\nLogged out (${code}). Session cleared - run again to pair.\n`);
        process.exit(1);
      }

      // 515 is restartRequired, and it is what SUCCESS looks like: WhatsApp
      // ends the stream immediately after pair-success and expects the client
      // to come back with the credentials it just saved. Treating it as a
      // failure deleted a pairing that had actually worked - the socket logged
      // pair-success one frame earlier.
      if (code === DisconnectReason.restartRequired) {
        console.log("\nPaired. Restarting the connection...\n");
        start();
        return;
      }

      // Credentials we know work: reconnect, never delete. Everything from
      // here down is an ordinary disconnect.
      if (everConnected || registered) {
        console.log(`Connection closed (${code}). Reconnecting in 3s...`);
        setTimeout(start, 3000);
        return;
      }

      // Never connected and never registered, so the pairing attempt itself
      // failed and these half-written credentials are worthless. Reconnecting
      // here would silently issue a SECOND code while the first is still on
      // screen, and pairing with the stale one then fails - which is exactly
      // how this broke the first time.
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log(`\nPairing window expired (${code}). Run again for a fresh code.\n`);
      process.exit(1);
    }
  });

  // Prints every group this account is in, so the right CREW_GROUP_ID can be
  // copied without guessing.
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      const chatJid = msg.key.remoteJid ?? "";
      const isGroup = chatJid.endsWith("@g.us");
      const myNumber = toNumber(sock.user?.id);
      // WhatsApp's "Message Yourself" chat: the one place where a message you
      // sent should still get an answer. Linked to your own account the
      // assistant sees your outgoing messages as fromMe, so without this it
      // could never reply to you at all - and answering fromMe everywhere
      // would mean replying in every conversation you have.
      const isSelfChat = !isGroup && toNumber(chatJid) === myNumber;
      if (msg.key.fromMe && !isSelfChat) continue;

      const senderJid = isGroup ? msg.key.participant ?? "" : chatJid;
      const rawSender = isSelfChat ? myNumber : toNumber(senderJid);
      // An unmapped LID stays itself, so it is still rejected rather than
      // waved through.
      const sender = CREW_ALIASES[rawSender] ?? rawSender;
      const text = readText(msg);

      if (!text) continue;
      if (!CREW.includes(sender)) {
        // LID DIAG: WhatsApp now addresses senders by an opaque @lid rather
        // than their phone number, so the allowlist never matches. Dump the
        // whole key to find which field, if any, still carries the number.
        console.log(`  ignored: ${sender} is not in the crew`);
        console.log(`  key: ${JSON.stringify(msg.key)}`);
        console.log(`  (add ${rawSender}=<phone> to CREW_ALIASES if this is a crew member)`);
        if (msg.participant) console.log(`  participant: ${msg.participant}`);
        if (msg.verifiedBizName) console.log(`  bizName: ${msg.verifiedBizName}`);
        continue;
      }
      if (isGroup && GROUP_ID && chatJid !== GROUP_ID) {
        console.log(`  ignored: group ${chatJid} is not the crew group`);
        continue;
      }

      // In a group, listen to everything but only speak when addressed -
      // otherwise the assistant talks over every conversation in the room.
      const meJid = sock.user?.id ?? "";
      const mentioned = (
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
      ).some((j) => toNumber(j) === toNumber(meJid));
      const repliedToBot =
        toNumber(msg.message?.extendedTextMessage?.contextInfo?.participant ?? "") ===
        toNumber(meJid);
      const extractOnly = isGroup && !mentioned && !repliedToBot;

      console.log(
        `[${isGroup ? "group" : isSelfChat ? "self" : "direct"}] ${sender}: ${text.slice(0, 60)}` +
          (extractOnly ? "  (listening only)" : "")
      );

      try {
        await sock.readMessages([msg.key]);
        if (!extractOnly) await sock.sendPresenceUpdate("composing", chatJid);

        const { reply, outbox } = await askAgent({ from: sender, text, isGroup, extractOnly });

        if (reply) {
          await sock.sendMessage(chatJid, { text: reply });
          console.log(`  replied: ${reply.slice(0, 60)}`);
        }

        // Messages for people outside this chat. The app decided these were
        // allowed - it checked the number against what the sender typed - and
        // this just delivers them. One failure must not stop the rest.
        for (const out of outbox) {
          try {
            await sock.sendMessage(`${out.to}@s.whatsapp.net`, { text: out.text });
            console.log(`  sent to ${out.to}: ${out.text.slice(0, 50)}`);
          } catch (error) {
            console.error(`  could not send to ${out.to}:`, error?.message ?? error);
          }
        }
      } catch (error) {
        console.error("  failed to handle message:", error?.message ?? error);
      } finally {
        if (!extractOnly) await sock.sendPresenceUpdate("paused", chatJid).catch(() => {});
      }
    }
  });

  // One-off helper: `LIST_GROUPS=1 node worker/whatsapp.mjs` prints group ids.
  if (process.env.LIST_GROUPS === "1") {
    sock.ev.on("connection.update", async ({ connection }) => {
      if (connection !== "open") return;
      const groups = await sock.groupFetchAllParticipating();
      console.log("\nGroups this account is in:\n");
      for (const [id, g] of Object.entries(groups)) {
        console.log(`  ${g.subject}\n    CREW_GROUP_ID=${id}\n`);
      }
    });
  }
}

start().catch((e) => {
  console.error("Worker failed to start:", e);
  process.exit(1);
});
