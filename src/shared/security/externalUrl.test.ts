import { describe, expect, it } from "vitest";

import { validateExternalUrl } from "./externalUrl";

describe("validateExternalUrl", () => {
  it("accepts normalized HTTPS URLs", () => {
    expect(validateExternalUrl("https://www.nasa.gov/mission"))
      .toBe("https://www.nasa.gov/mission");
  });

  it.each([
    "http://example.com",
    "file:///C:/secret.txt",
    "https://user:secret@example.com",
    "https://localhost/admin",
    "https://device.local/",
  ])("rejects unsafe URL %s", (url) => {
    expect(validateExternalUrl(url)).toBeNull();
  });
});
