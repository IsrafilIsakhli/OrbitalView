import { expect, it, vi } from "vitest";
import { prepareUpdate, registerUpdatePause, trackLocalWrite } from "./updateBarrier";

it("waits for pending writes, stops computation and rejects new writes", async () => {
  let finish!: () => void;
  const write = trackLocalWrite(() => new Promise<void>((resolve) => { finish = resolve; }));
  const resumed = vi.fn();
  const paused = vi.fn(() => resumed);
  const unregister = registerUpdatePause(paused);
  const handoff = prepareUpdate();
  await expect(trackLocalWrite(() => Promise.resolve(1))).rejects.toThrow("update-in-progress");
  expect(paused).toHaveBeenCalledOnce();
  finish();
  await write;
  const resume = await handoff;
  resume();
  expect(resumed).toHaveBeenCalledOnce();
  unregister();
  await expect(trackLocalWrite(() => Promise.resolve(2))).resolves.toBe(2);
});

it("aborts installation and resumes on a busy local writer", async () => {
  let finish!: () => void;
  const write = trackLocalWrite(() => new Promise<void>((resolve) => { finish = resolve; }));
  await expect(prepareUpdate(1)).rejects.toThrow("local-writes-busy");
  finish(); await write;
  await expect(trackLocalWrite(() => Promise.resolve(3))).resolves.toBe(3);
});

it("pauses workspaces mounted after update preparation has started", async () => {
  const resume = await prepareUpdate();
  const restart = vi.fn();
  const pause = vi.fn(() => restart);
  const unregister = registerUpdatePause(pause);
  expect(pause).toHaveBeenCalledOnce();
  resume();
  expect(restart).toHaveBeenCalledOnce();
  unregister();
});
