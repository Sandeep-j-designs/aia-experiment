const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "..");

function fresh() {
  const cache = new Map();
  const context = vm.createContext({
    structuredClone,
    Date,
    console,
    crypto: webcrypto,
    AbortController,
    setTimeout: () => 0,
  });
  function load(file) {
    if (!path.extname(file))
      file += fs.existsSync(file + ".ts") ? ".ts" : "/index.ts";
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const req = (name) =>
      name === "react"
        ? { useSyncExternalStore() {} }
        : load(
            name.startsWith("@/")
              ? path.join(root, name.slice(2))
              : path.resolve(path.dirname(file), name)
          );
    vm.runInContext("(function(require,exports){" + js + "\n})", context)(
      req,
      exports
    );
    return exports;
  }
  return {
    s: load(path.join(root, "components/inbox/v2/store.ts")),
    task: (name) =>
      load(path.join(root, "config/pages/neo/tasks", name)).default,
  };
}

function api(overrides = {}) {
  const cards = [],
    undo = [],
    messages = [],
    paths = [];
  return {
    cards,
    undo,
    messages,
    paths,
    runId: "test-run",
    prompt: "",
    context: { company: "shakun", selectedIds: [] },
    signal: new AbortController().signal,
    focus() {},
    say: async (text) => {
      messages.push(text);
    },
    step: async () => () => {},
    wait: async () => {},
    touch() {},
    onUndo: (fn) => undo.push(fn),
    ask: async (question, options) =>
      question.includes("GST rate")
        ? "18"
        : question.includes("place of supply")
          ? "29"
          : options[0].id,
    card: async (card, actions) => {
      cards.push(card);
      return actions[0].id;
    },
    updateCard() {},
    navigate: async (p) => paths.push(p),
    ...overrides,
  };
}

(async () => {
  {
    const { s } = fresh();
    const original = s
      .getState()
      .items.find(
        (x) =>
          x.company === "shakun" &&
          x.status === "Needs Review" &&
          x.route === "AP"
      );
    const before = structuredClone(original);
    s.applyBulkAction([original.id], "Ledger", "Office Expenses");
    const undo = s.neoUndoChanges([before], "edit-run");
    const changed = s.getState().items.find((x) => x.id === original.id);
    s.update(original.id, {
      form: { ...changed.form, narration: "Later human edit" },
    });
    assert.equal(undo().skipped.length, 1);
    assert.equal(
      s.getState().items.find((x) => x.id === original.id).form.narration,
      "Later human edit"
    );
    const created = s.neoCreate(
      { ...structuredClone(original), id: "NEO-TEST" },
      "create-run"
    );
    s.update(created.id, {
      form: { ...created.form, narration: "Keep this edit" },
    });
    assert.equal(s.neoDiscard([created], "create-run").skipped.length, 1);
    const untouched = s.neoCreate(
      { ...structuredClone(original), id: "NEO-UNTOUCHED" },
      "create-run"
    );
    assert.equal(s.neoDiscard([untouched], "create-run").reversed.length, 1);
    assert(!s.getState().items.some((x) => x.id === untouched.id));
    const ready = s
      .getState()
      .items.find(
        (x) =>
          x.company === "shakun" && x.status === "Needs Review" && !s.issue(x)
      );
    const draft = s.neoCreate(
      {
        ...structuredClone(ready),
        id: "NEO-APPROVED",
        form: { ...ready.form, invoiceNo: "UNIQUE-NEO-TEST" },
      },
      "approved-run"
    );
    assert.equal(s.approve(draft.id), "");
    assert.equal(s.neoDiscard([draft], "approved-run").skipped.length, 1);
    const targets = s
      .getState()
      .items.filter(
        (x) =>
          x.company === "shakun" &&
          x.route === "AP" &&
          x.status === "Needs Review"
      )
      .slice(0, 2);
    const snapshots = structuredClone(targets);
    s.applyBulkAction(
      targets.map((x) => x.id),
      "Ledger",
      "Freight Inward"
    );
    const reverse = s.neoUndoChanges(snapshots, "partial-run");
    const later = s.getState().items.find((x) => x.id === targets[1].id);
    s.update(later.id, { form: { ...later.form, narration: "Preserve" } });
    const result = reverse();
    assert.equal(result.reversed.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(
      JSON.stringify(s.getState().items.find((x) => x.id === targets[0].id)),
      JSON.stringify(snapshots[0])
    );
  }
  {
    const { s, task } = fresh();
    const a = api({
      prompt:
        "Create a sales invoice from INB-2041 for Theta Hotels Pvt Ltd with 15% markup",
    });
    const bill = structuredClone(
      s.getState().items.find((x) => x.id === "INB-2041")
    );
    await task("sales-from-purchase").run(a);
    const draft = s
      .getState()
      .items.find((x) => x.preparedBy?.runId === a.runId);
    assert(draft && draft.status === "Needs Review");
    const preview = a.cards.find((c) => c.kind === "voucher");
    assert.equal(preview.items.length, bill.form.lines.length);
    assert.equal(
      draft.amount,
      preview.lines.find((l) => l.side === "Dr").amount
    );
    assert.equal(
      JSON.stringify(s.getState().items.find((x) => x.id === bill.id)),
      JSON.stringify(bill)
    );
    assert(preview.assumptions.some((x) => x.includes("quantity 1")));
    assert.equal(a.undo[0]().reversed.length, 1);
  }
  {
    const { s, task } = fresh();
    const a = api({
      prompt:
        "Create a sales invoice from INB-2041 for Theta Hotels Pvt Ltd with 15% markup",
      card: async () => {
        const bill = s.getState().items.find((x) => x.id === "INB-2041");
        s.update(bill.id, {
          form: { ...bill.form, narration: "Changed during preview" },
        });
        return "create";
      },
    });
    await assert.rejects(
      task("sales-from-purchase").run(a),
      /source purchase changed/
    );
    assert(!s.getState().items.some((x) => x.preparedBy?.runId === a.runId));
  }
  {
    const { s, task } = fresh();
    const before = JSON.stringify(s.getState().items);
    const a = api({ prompt: "Approve everything above 90% confidence" });
    await task("approve-batch").run(a);
    assert(a.paths[0].startsWith("/inbox?neoReview="));
    assert.equal(
      JSON.stringify(s.getState().items),
      before,
      "handoff never approves records"
    );
    const empty = api({ prompt: "Approve selected records" });
    await task("approve-batch").run(empty);
    assert.equal(
      empty.cards.length,
      0,
      "empty selection must never widen to the company"
    );
  }
  console.log(
    "PASS: protected and partial Undo, approved-record protection, sales preview/store agreement, stale-source refusal, approval handoff, and empty-selection protection."
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
