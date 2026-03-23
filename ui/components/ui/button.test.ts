import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("keeps outline buttons readable on themed backgrounds", () => {
    const className = buttonVariants({ variant: "outline" });

    expect(className).toContain("bg-background");
    expect(className).toContain("text-foreground");
  });
});
