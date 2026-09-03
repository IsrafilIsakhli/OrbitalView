import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { initialAppUpdateState, useAppUpdateStore } from "../model/updateStore";
import { checkForAppUpdate, dismissOptionalUpdate, installAppUpdate } from "./appUpdater";

const mocks = vi.hoisted(() => ({ check: vi.fn(), invoke: vi.fn(), prepare: vi.fn(), resume: vi.fn(), relaunch: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("../domain/updateBarrier", () => ({ prepareUpdate: mocks.prepare }));
vi.mock("@/shared/security/externalUrl", () => ({ openExternalUrl: mocks.open }));

function update(version = "0.1.3", severity = "optional") {
  return {
    version, currentVersion: "0.1.2", body: JSON.stringify({ schemaVersion: 1, version, severity,
      minimumSupportedVersion: severity === "critical" ? version : "0.1.0",
      notes: { az: "test", tr: "test", en: "test", ru: "test", es: "test" } }),
    download: vi.fn().mockResolvedValue(undefined), install: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("native update orchestration", () => {
  beforeEach(async () => {
    vi.stubEnv("DEV", false);
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useAppUpdateStore.setState(initialAppUpdateState);
    mocks.invoke.mockResolvedValue({ automatic: true, packageKind: "msi", architecture: "x86_64", target: "windows-x86_64-msi" });
    mocks.prepare.mockResolvedValue(mocks.resume);
    mocks.relaunch.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue(undefined);
    mocks.check.mockResolvedValue(null);
    await checkForAppUpdate();
    useAppUpdateStore.setState(initialAppUpdateState);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps optional installation opt-in and selects the MSI target", async () => {
    const offered = update(); mocks.check.mockResolvedValue(offered);
    await checkForAppUpdate();
    expect(mocks.check).toHaveBeenLastCalledWith({ timeout: 15000, target: "windows-x86_64-msi" });
    expect(offered.download).not.toHaveBeenCalled();
    dismissOptionalUpdate();
    expect(useAppUpdateStore.getState().promptOpen).toBe(false);
  });
  it("replaces an open older offer with a newer critical release", async () => {
    const older = update(); mocks.check.mockResolvedValue(older); await checkForAppUpdate();
    const critical = update("0.1.4", "critical"); mocks.check.mockResolvedValue(critical); await checkForAppUpdate();
    expect(older.close).toHaveBeenCalledOnce();
    expect(useAppUpdateStore.getState().release).toMatchObject({ version: "0.1.4", required: true });
    dismissOptionalUpdate();
    expect(useAppUpdateStore.getState().promptOpen).toBe(true);
  });
  it("rejects malformed metadata before downloading anything", async () => {
    const broken = update(); broken.body = "{broken"; mocks.check.mockResolvedValue(broken);
    await checkForAppUpdate(); await installAppUpdate();
    expect(useAppUpdateStore.getState().status).toBe("error");
    expect(broken.download).not.toHaveBeenCalled();
    expect(broken.close).toHaveBeenCalled();
  });
  it("never installs after the native download/signature verification rejects", async () => {
    const broken = update(); broken.download.mockRejectedValue(new Error("invalid signature")); mocks.check.mockResolvedValue(broken);
    await checkForAppUpdate(); await installAppUpdate();
    expect(broken.install).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().errorCode).toBe("installFailed");
  });
  it("drains local writes and native work before installation, then recovers on failure", async () => {
    const offered = update(); offered.install.mockRejectedValue(new Error("installer failed")); mocks.check.mockResolvedValue(offered);
    await checkForAppUpdate(); await installAppUpdate();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("prepare_app_update");
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(offered.install.mock.invocationCallOrder[0]!);
    expect(mocks.resume).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("resume_after_failed_update");
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it("routes DEB updates to the matching public package without running the AppImage updater", async () => {
    mocks.invoke.mockResolvedValue({ automatic: false, packageKind: "deb", architecture: "aarch64", target: "linux-aarch64" });
    const offered = update(); mocks.check.mockResolvedValue(offered); await checkForAppUpdate(); await installAppUpdate();
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/IsrafilIsakhli/OrbitalVision-Releases/releases/download/v0.1.3/orbital-vision-0.1.3-linux-aarch64-deb.deb");
    expect(offered.download).not.toHaveBeenCalled(); expect(offered.install).not.toHaveBeenCalled();
  });
  it("fails safely on a platform/server error without blocking application startup", async () => {
    mocks.check.mockRejectedValue(new Error("unsupported target"));
    await expect(checkForAppUpdate()).resolves.toBeUndefined();
    expect(useAppUpdateStore.getState().errorCode).toBe("checkFailed");
  });
  it("cannot dismiss an in-progress installation", async () => {
    mocks.check.mockResolvedValue(update()); await checkForAppUpdate();
    useAppUpdateStore.setState({ status: "installing" }); dismissOptionalUpdate();
    expect(useAppUpdateStore.getState().promptOpen).toBe(true);
  });
});
