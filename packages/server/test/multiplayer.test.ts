/**
 * 3- and 4-player rooms and online Commander (PLAN-E, E13): the game starts when the room is full, everyone
 * sees their opponents; a player who leaves concedes and the game goes on without them; a Commander room validates the
 * commander and gives 40 life; no BO3 with several players.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeckEntries } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, GREEN, RED, server } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});
async function start(config = {}) {
  srv = await server(config);
  return srv.port;
}
async function connect(port: number, n: number): Promise<Client[]> {
  const out = await Promise.all(Array.from({ length: n }, () => Client.connect(port)));
  clients.push(...out);
  return out;
}

/** Minimal legal Commander deck: Arahbo and 99 Plains (basic lands: several copies allowed). */
const ARAHBO: DeckEntries = [[1, "Arahbo, the First Fang"]];
const PLAINS_99: DeckEntries = [[99, "Plains"]];

describe("multiplayer rooms", () => {
  it("with three: the game starts when the third arrives; seats p1 to p3, two opponents each", async () => {
    const port = await start();
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: GREEN, players: 3, bestOf: 3 });
    const created = await a.next("room");
    expect(created.room.match.seats).toBe(3);
    // No BO3 with several players.
    expect(created.room.match.bestOf).toBe(1);
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    const waiting = await b.next("room");
    expect(waiting.room.status).toBe("waiting");
    c.send({ type: "join", code: created.room.code, name: "Chloe", deck: GREEN });
    const seen = await Promise.all([a, b, c].map((x) => x.next("update")));
    expect(seen.map((u) => u.view.viewer).sort()).toEqual(["p1", "p2", "p3"]);
    for (const u of seen) expect(u.view.opponents).toHaveLength(2);
    // A fourth is refused.
    const [d] = (await connect(port, 1)) as [Client];
    d.send({ type: "join", code: created.room.code, name: "David", deck: RED });
    expect((await d.next("error")).code).toBe("full");
  });

  it("a player who does not come back concedes; with three, the game goes on between the other two", async () => {
    const port = await start({ graceMs: 150 });
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: GREEN, players: 3 });
    const created = await a.next("room");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    c.send({ type: "join", code: created.room.code, name: "Chloe", deck: GREEN });
    const [, , up] = await Promise.all([a, b, c].map((x) => x.next("update")));
    // Bob and Chloe arrive at the same time: Chloe's seat is the one the server gives her.
    const seat = up?.view.viewer ?? "p3";
    await c.close();
    const after = await a.next("update", (m) => !!m.view.players[seat]?.lost, 10_000);
    expect(after.view.over).toBe(false);
    expect(after.view.players[seat]?.lost).toBe(true);
  }, 20_000);
});

describe("Commander en ligne", () => {
  it("commander validated, 40 life, commander in everyone's command zone", async () => {
    const port = await start();
    const [a, b, c] = (await connect(port, 3)) as [Client, Client, Client];
    a.send({ type: "create", name: "Alice", deck: PLAINS_99, commander: ARAHBO, format: "commander", players: 3 });
    const created = await a.next("room");
    expect(created.room.match.format).toBe("commander");
    expect(created.room.deck.commander).toEqual(ARAHBO);
    // Without a commander: refused.
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99 });
    expect((await b.next("error")).code).toBe("deck");
    // Standard deck in a Commander room: refused (100 cards, identity...).
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: GREEN, commander: ARAHBO });
    expect((await b.next("error")).code).toBe("deck");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99, commander: ARAHBO });
    c.send({ type: "join", code: created.room.code, name: "Chloe", deck: PLAINS_99, commander: ARAHBO });
    const u = await a.next("update");
    for (const p of ["p1", "p2", "p3"]) {
      expect(u.view.players[p]?.life).toBe(40);
      expect(u.view.players[p]?.commanders?.[0]?.zone).toBe("command");
    }
  });
});

describe("Commander: deck chosen in the room", () => {
  it("the deck sent in the room needs its commander; the AI seats are ready at once", async () => {
    const port = await start();
    const [a] = await connect(port, 1);
    a?.send({ type: "create", name: "Alice", format: "commander", players: 2, ai: { count: 1, level: "beginner" } });
    const created = await a!.next("room", (m) => m.room.players.length === 2);
    expect([created.room.status, created.room.players.map((p) => p.ready)]).toEqual(["waiting", [false, true]]);
    a?.send({ type: "deck", deck: PLAINS_99 });
    expect((await a!.next("error")).code).toBe("deck");
    a?.send({ type: "deck", deck: PLAINS_99, commander: ARAHBO });
    const u = await a!.next("update");
    expect(u.view.players.p1?.commanders?.[0]?.zone).toBe("command");
  }, 30_000);
});

describe("resuming a three-player Commander room", () => {
  it("after a server restart, everyone resumes with their token: commanders and 40 life kept", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mtgx-rooms-"));
    try {
      const first = await server({ dataDir, graceMs: 10_000 });
      const cs = await Promise.all([0, 1, 2].map(() => Client.connect(first.port)));
      const [a, b, c] = cs as [Client, Client, Client];
      a.send({ type: "create", name: "Alice", deck: PLAINS_99, commander: ARAHBO, format: "commander", players: 3 });
      const created = await a.next("room");
      b.send({ type: "join", code: created.room.code, name: "Bob", deck: PLAINS_99, commander: ARAHBO });
      c.send({ type: "join", code: created.room.code, name: "Chloe", deck: PLAINS_99, commander: ARAHBO });
      await Promise.all(cs.map((x) => x.next("update")));
      const tokens = cs.map((x) => {
        const r = [...x.received].reverse().find((m) => m.type === "room");
        return r?.type === "room" ? r.room.token : "";
      });
      await Promise.all(cs.map((x) => x.close()));
      await first.close();
      srv = await server({ dataDir, graceMs: 10_000 });
      expect(srv.rooms.size).toBe(1);
      const back = await Promise.all([0, 1, 2].map(() => Client.connect(srv?.port ?? 0)));
      clients.push(...back);
      for (const [i, x] of back.entries()) x.send({ type: "rejoin", token: tokens[i] as string });
      const ups = await Promise.all(back.map((x) => x.next("update")));
      for (const u of ups) {
        expect(u.view.opponents).toHaveLength(2);
        expect(u.view.players.p2?.life).toBe(40);
        expect(u.view.players.p3?.commanders?.[0]?.zone).toBe("command");
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20_000);
});
