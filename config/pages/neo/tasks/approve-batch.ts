import { issue } from "@/components/inbox/v2/store";
import type { NeoTask } from "@/types/pages/neo";
import { findPercent, has, money } from "@/utils/pages/neo";
import { companyItems, describe, total, label } from "./shared";
import { READY_CONFIDENCE } from "./triage";

/** Prepares a review selection; approval stays in the existing Inbox controls. */
const approveBatch: NeoTask = {
  id: "approve-batch",
  title: "Prepare an approval batch",
  match: (p) => (has(p, /\bapprove\b/i) ? 2 : 0),
  run: async (api) => {
    const selectionRequested = has(api.prompt, /select|ticked|these|chosen/i);
    const selected = selectionRequested ? api.context.selectedIds : [];
    if (selectionRequested && !selected.length) {
      await api.say(
        "Select the records first. No approval batch was prepared."
      );
      return "No selection";
    }
    const threshold = (findPercent(api.prompt) ?? READY_CONFIDENCE * 100) / 100;
    const scan = await api.step(
      selected.length
        ? `Checking the ${selected.length} selected document${selected.length === 1 ? "" : "s"}`
        : `Finding documents at ${Math.round(threshold * 100)}% confidence or more`
    );
    await api.wait(600);
    const pool = companyItems().filter(
      (x) =>
        x.status === "Needs Review" &&
        (selected.length ? selected.includes(x.id) : x.confidence >= threshold)
    );
    const ready = pool.filter((x) => !issue(x));
    const blocked = pool.filter((x) => issue(x));
    scan(
      `${pool.length} match${pool.length === 1 ? "es" : ""}: ${ready.length} can post, ${blocked.length} blocked`
    );
    if (!ready.length) {
      await api.say(
        pool.length
          ? "None of them can be approved yet — each is missing something. Open one to fill it in."
          : selected.length
            ? "None of the selected documents are waiting for review."
            : `Nothing waiting for review is at ${Math.round(threshold * 100)}% confidence or more.`
      );
      return "Nothing to approve";
    }
    await api.say(
      "Confidence is a routing signal, not approval evidence. Review the documents and their accounting values in the Inbox before approving."
    );
    const choice = await api.card(
      {
        kind: "list",
        title: "Approval batch",
        groups: [
          {
            label: `Available for review · ${money(total(ready))}`,
            tone: "positive",
            rows: ready.map((x) => ({
              itemId: x.id,
              primary: describe(x),
              secondary: `${label(x)} · ${x.form.voucherType} · ${Math.round(x.confidence * 100)}%`,
              amount: x.amount,
            })),
          },
          ...(blocked.length
            ? [
                {
                  label: "Left out — can't post yet",
                  tone: "negative" as const,
                  rows: blocked.map((x) => ({
                    itemId: x.id,
                    primary: describe(x),
                    secondary: `${label(x)} · ${issue(x)}`,
                    amount: x.amount,
                  })),
                },
              ]
            : []),
        ],
      },
      [
        {
          id: "review",
          label: `Open review · ${ready.length} records`,
          primary: true,
          risk: "read",
        },
        { id: "cancel", label: "Not now" },
      ]
    );
    if (choice !== "review") {
      await api.say("Left as they are. Nothing was approved.");
      return "Cancelled";
    }
    await api.navigate(
      `/inbox?neoReview=${encodeURIComponent(ready.map((x) => x.id).join(","))}`
    );
    return `${ready.length} prepared for review · nothing approved`;
  },
};

export default approveBatch;
