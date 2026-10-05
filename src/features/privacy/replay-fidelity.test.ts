import { waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventType, record } from "posthog-js/dist/rrweb.js";
import { SESSION_REPLAY_OPTIONS } from "./analytics";

it("the actual recorder preserves CSS, UI text, images and normal inputs while excluding protected content", async () => {
  const style = document.createElement("style");
  style.textContent =
    ".replay-surface { color: rgb(12, 34, 56); display: grid; }";
  document.head.append(style);
  const surface = document.createElement("main");
  surface.className = "replay-surface";
  surface.style.padding = "24px";
  surface.innerHTML = `
    <h1>Continue setting up Jobmiter</h1>
    <img src="/jobmiter-logo.svg" alt="Jobmiter logo" />
    <input type="text" value="React" />
    <input type="password" value="fixture-password-secret" />
    <input type="hidden" value="fixture-session-secret" />
    <section data-analytics-private>fixture-private-resume-text</section>
    <iframe src="/fixture-private-resume.pdf"></iframe>
    <span class="ph-mask">fixture-masked-text</span>
  `;
  document.body.append(surface);
  const snapshots: string[] = [];
  const stop = record({
    ...SESSION_REPLAY_OPTIONS,
    emit: (event) => {
      if (event.type === EventType.FullSnapshot)
        snapshots.push(JSON.stringify(event.data.node));
    },
  });
  try {
    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
    const snapshot = snapshots[0];
    expect(snapshot).toContain("Continue setting up Jobmiter");
    expect(snapshot).toContain(".replay-surface");
    expect(snapshot).toContain('"class":"replay-surface"');
    expect(snapshot).toContain("padding: 24px");
    expect(snapshot).toContain("jobmiter-logo.svg");
    expect(snapshot).toContain("React");
    expect(snapshot).not.toMatch(
      /fixture-password-secret|fixture-session-secret|fixture-private-resume|fixture-masked-text/u,
    );
  } finally {
    stop?.();
    surface.remove();
    style.remove();
  }
});
