// Why a program didn't play, in words a viewer can act on, and what kind of failure it was:
//
//   item     this one program can't play here: removed, region-locked, embedding turned off, a damaged
//            file, a live broadcast that ended. The service is fine: skip it and carry on.
//   service  YouTube or the Archive won't play anything here right now (its player didn't load, or it
//            refuses this page): stand by and retry, and don't hold it against the programs.
//   unsure   could be either (a timeout, a file that wouldn't load): skip it, and three of these in a
//            couple of minutes means the service is down.
//
// opts: { youtube: bool, code: the YouTube player's error code or the <video> MediaError code,
//         reason: "error" | "timeout" | "stall" | "ended" }
// Returns { kind, service: "youtube" | "archive", text, short }.

const YT = {
  0: ["service", "YouTube's player didn't load. An ad or tracker blocker, a network filter, or no internet is keeping it out.", "YouTube didn't load"],
  2: ["item", "YouTube says this video's id is wrong.", "bad video id"],
  5: ["unsure", "YouTube's player couldn't play this video on this device.", "YouTube player error"],
  100: ["item", "It was removed from YouTube or made private.", "removed from YouTube"],
  101: ["item", "Its owner doesn't let it play here: not in this country, or not outside YouTube.", "not allowed here"],
  150: ["item", "Its owner doesn't let it play here: not in this country, or not outside YouTube.", "not allowed here"],
  152: ["service", "YouTube won't play videos inside this page on this device (error 152).", "YouTube refused the page"],
  153: ["service", "YouTube won't play videos inside this page on this device (error 153).", "YouTube refused the page"],
};

const MEDIA = {
  1: ["unsure", "Loading was interrupted.", "loading interrupted"],
  2: ["unsure", "The connection to the Internet Archive dropped.", "connection dropped"],
  3: ["item", "The file is damaged, or in a format this TV can't play.", "can't decode the file"],
  4: ["unsure", "The Internet Archive's file wouldn't load. It may have been taken down.", "file wouldn't load"],
};

export function failureInfo(opts) {
  const o = opts || {};
  const service = o.youtube ? "youtube" : "archive";
  const make = function (row, code) {
    return { kind: row[0], service: service, text: row[1], short: row[2], code: code };
  };
  if (o.reason === "ended") return make(["item", "The live broadcast ended.", "broadcast ended"]);
  if (o.reason === "timeout")
    return make(["unsure", o.youtube ? "YouTube took too long to start it." : "The Internet Archive took too long to send it.", "took too long to start"]);
  if (o.reason === "stall") return make(["unsure", "It stopped to buffer for too long.", "stuck buffering"]);
  const code = Number(o.code);
  const table = o.youtube ? YT : MEDIA;
  if (table[code]) return make(table[code], code);
  return make(o.youtube ? ["unsure", "YouTube's player stopped" + (code ? " (error " + code + ")" : "") + ".", "YouTube player error"] : ["unsure", "The file wouldn't play.", "wouldn't play"], code);
}

// Words for "technical difficulties": what isn't answering.
export function standbyText(why, text) {
  if (why === "offline") return "This TV is offline. Check the Wi-Fi.";
  if (text) return text;
  return why === "youtube" ? "YouTube isn't answering right now." : "The Internet Archive isn't answering right now.";
}
