// A small M3E-style expansion-panel group: a summary row with a chevron that
// rotates, and a body that grows. Opening one closes the rest (single-open).
// No Lit — it is a couple of DOM nodes and CSS.

import { h, svg } from "./dom";
import { ICONS } from "./icons";

export interface AccordionSection {
  title: string;
  /** Optional element shown at the right of the summary row (e.g. a status dot). */
  trailing?: HTMLElement | null;
  body: HTMLElement;
}

export function accordion(sections: AccordionSection[]): HTMLElement {
  const root = h("div", { class: "m3e-accordion" });
  const panels: HTMLElement[] = [];

  const closeAll = (except: HTMLElement | null) => {
    for (const p of panels) p.classList.toggle("open", p === except);
  };

  for (const section of sections) {
    const summary = h(
      "button",
      { class: "m3e-panel-summary", type: "button" },
      svg(ICONS.chevronRight, 10),
      h("span", { class: "m3e-panel-title", text: section.title }),
      h("div", { class: "grow" }),
      section.trailing ?? null,
    );
    const panel = h(
      "div",
      { class: "m3e-panel" },
      summary,
      h(
        "div",
        { class: "m3e-panel-body" },
        h("div", { class: "m3e-panel-content" }, section.body),
      ),
    );
    summary.addEventListener("click", () => {
      const willOpen = !panel.classList.contains("open");
      closeAll(willOpen ? panel : null);
    });
    panels.push(panel);
    root.append(panel);
  }

  return root;
}
