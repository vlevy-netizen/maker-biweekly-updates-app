const { App } = require("@slack/bolt");
const dayjs = require("dayjs");
const express = require("express");

// --- Initialize Bolt (Socket Mode) ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ---------- Utilities ----------
function getBlock(values, prefix) {
  const key = Object.keys(values).find((k) => k.startsWith(prefix));
  return key ? values[key] : undefined;
}

// Convert Slack rich_text to mrkdwn
function richToMrkdwn(rt) {
  if (!rt) return "";
  function walk(el) {
    if (!el) return "";
    switch (el.type) {
      case "rich_text": return (el.elements || []).map(walk).join("");
      case "rich_text_section": return (el.elements || []).map(walk).join("");
      case "text": return el.text || "";
      case "emoji": return el.name ? `:${el.name}:` : "";
      case "link": return el.url ? `<${el.url}|${el.text || el.url}>` : "";
      case "user": return el.user_id ? `<@${el.user_id}>` : "";
      case "rich_text_list": {
        const items = (el.elements || []).map(li =>
          "- " + (li.elements || []).map(walk).join("")
        );
        return items.join("\n") + "\n";
      }
      default: return "";
    }
  }
  return walk(rt).trim();
}

// Format URL as a clean hyperlink (<url|label>)
function asLink(url, label = "Link") {
  if (!url) return "";
  const looksLike = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return `<${looksLike}|${label}>`;
}

// Emoji for RAG
const RAG_EMOJI = {
  Green: "🟢",
  Yellow: "🟡",
  Red: "🔴",
  Paused: "⚫",
  Completed: "🔵",
};

// ---------- Lists ----------
const RAG = ["Green", "Yellow", "Red", "Paused", "Completed"];
const GTM = ["Pre-Alpha", "Alpha", "Beta", "GA", "Global"];
const PHASE = ["Design", "Build/Development", "QA/UAT", "Deployment", "Hypercare"];
const LAUNCH_Q = ["Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"];

// ---------- UI BUILDERS ----------
function headerModal({ userId }) {
  const meta = { projects: [], user: userId };
  return {
    type: "modal",
    callback_id: "header_submit",
    title: { type: "plain_text", text: "Maker Biweekly Update" },
    submit: { type: "plain_text", text: "Next →" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "post_channel",
        label: { type: "plain_text", text: "Post to channel" },
        element: {
          type: "conversations_select",
          default_to_current_conversation: true,
          filter: { include: ["public", "private"] },
          action_id: "val",
        },
      },
      {
        type: "input",
        block_id: "squad",
        label: { type: "plain_text", text: "Squad" },
        element: {
          type: "static_select",
          action_id: "val",
          options: ["Payments", "Platform", "Client Delight", "Data", "Staff Workflows"].map(
            (s) => ({ text: { type: "plain_text", text: s }, value: s })
          ),
        },
      },
      {
        type: "input",
        block_id: "roadmap_link",
        optional: false,
        label: { type: "plain_text", text: "Link to roadmap or project tracker" },
        element: {
          type: "plain_text_input",
          action_id: "val",
          placeholder: { type: "plain_text", text: "Paste the URL (e.g., https://…)" },
        },
      },
      {
        type: "input",
        block_id: "focus_rich",
        optional: false,
        label: { type: "plain_text", text: "Summary of focus areas this sprint" },
        element: { type: "rich_text_input", action_id: "val" },
      },
    ],
    private_metadata: JSON.stringify(meta),
  };
}

function projectModal(meta, existing = null) {
  const idx = existing ? existing.idx : meta.projects.length;
  const initialOption = (value) =>
    value ? { text: { type: "plain_text", text: value }, value } : undefined;

  return {
    type: "modal",
    callback_id: "project_submit",
    title: { type: "plain_text", text: `Project ${idx + 1}` },
    submit: { type: "plain_text", text: "Save & Post" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Add one project, then click* *Add another*, *Back*, *or* *Done*.",
        },
      },
      {
        type: "input",
        block_id: `p_name_${idx}`,
        label: { type: "plain_text", text: "Project name" },
        element: { type: "plain_text_input", action_id: "val", initial_value: existing?.name || "" },
      },
      {
        type: "input",
        block_id: `p_jira_${idx}`,
        label: { type: "plain_text", text: "Jira Initiative Link" },
        element: { type: "plain_text_input", action_id: "val", initial_value: existing?.jira || "" },
        optional: true,
      },
      {
        type: "input",
        block_id: `p_tldr_${idx}`,
        label: { type: "plain_text", text: "TL;DR (rich text)" },
        element: { type: "rich_text_input", action_id: "val" },
      },
      {
        type: "input",
        block_id: `p_rag_${idx}`,
        label: { type: "plain_text", text: "RAG status" },
        element: {
          type: "static_select",
          action_id: "val",
          initial_option: initialOption(existing?.rag),
          options: RAG.map((r) => ({ text: { type: "plain_text", text: r }, value: r })),
        },
      },
      {
        type: "input",
        block_id: `p_gtm_${idx}`,
        label: { type: "plain_text", text: "GTM stage" },
        element: {
          type: "static_select",
          action_id: "val",
          initial_option: initialOption(existing?.gtm),
          options: GTM.map((g) => ({ text: { type: "plain_text", text: g }, value: g })),
        },
      },
      {
        type: "input",
        optional: true,
        block_id: `p_launchq_${idx}`,
        label: { type: "plain_text", text: "Target launch quarter" },
        element: {
          type: "static_select",
          action_id: "val",
          initial_option: existing?.launchQ
            ? { text: { type: "plain_text", text: existing.launchQ }, value: existing.launchQ }
            : undefined,
          options: LAUNCH_Q.map((q) => ({
            text: { type: "plain_text", text: q },
            value: q,
          })),
        },
      },
      {
        type: "input",
        block_id: `p_phase_${idx}`,
        label: { type: "plain_text", text: "Phase" },
        element: {
          type: "static_select",
          action_id: "val",
          initial_option: initialOption(existing?.phase),
          options: PHASE.map((p) => ({ text: { type: "plain_text", text: p }, value: p })),
        },
      },
      {
        type: "actions",
        block_id: `next_action_${idx}`,
        elements: [
          { type: "button", text: { type: "plain_text", text: "◀︎ Back" }, action_id: "back" },
          { type: "button", text: { type: "plain_text", text: "➕ Add another" }, action_id: "add_another", style: "primary" },
          { type: "button", text: { type: "plain_text", text: "✅ Done" }, action_id: "done" },
        ],
      },
    ],
    private_metadata: JSON.stringify(meta),
  };
}

// Build final message
function buildMessage(metaHeader, projects) {
  const today = dayjs().format("YYYY-MM-DD");
  const submittedBy = metaHeader.user ? `<@${metaHeader.user}>` : "(unknown)";
  const head =
    `*MAKER BIWEEKLY UPDATE*\n` +
    `*Date:* ${today}   *Submitted by:* ${submittedBy}\n` +
    `*Squad:* ${metaHeader.squad}` +
    (metaHeader.roadmap ? `   *Roadmap:* ${asLink(metaHeader.roadmap)}` : "") +
    `\n\n\n*SUMMARY OF FOCUS AREAS THIS SPRINT*\n${metaHeader.focus || "_(none provided)_"}\n\n\n*PROJECT UPDATES*`;

  const blocks = [{ type: "section", text: { type: "mrkdwn", text: head } }, { type: "divider" }];

  projects.forEach((p, i) => {
    const ragIcon = RAG_EMOJI[p.rag] || "";
    const lines = [];
    lines.push(`*${i === 0 ? "💥" : "💡"} ${p.name}*`);
    if (p.jira) lines.push(`*Jira:* ${asLink(p.jira, "Initiative")}`);
    if (p.tldr) lines.push(`*TL;DR*\n${p.tldr}`);
    lines.push(
      `*RAG:* ${ragIcon} ${p.rag}   *GTM:* ${p.gtm}` +
        (p.launchQ ? `   *Target launch quarter:* ${p.launchQ}` : "")
    );
    lines.push(`*Phase:* ${p.phase}`);

    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
    blocks.push({ type: "divider" });
  });
  return blocks;
}

// --- Post helper with auto-join ---
async function postMessageWithJoin(client, channel, blocks, text = "Maker Biweekly Update") {
  try {
    await client.chat.postMessage({ channel, blocks, text });
  } catch (err) {
    const code = err?.data?.error;
    if (code === "channel_not_found" || code === "not_in_channel") {
      try {
        await client.conversations.join({ channel });
        await client.chat.postMessage({ channel, blocks, text });
      } catch (err2) {
        console.error("Post after join failed:", err2);
        throw err2;
      }
    } else {
      throw err;
    }
  }
}

// ---------- HANDLERS ----------

// Slash command
app.command("/maker-biweekly-update", async ({ ack, body, client }) => {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: headerModal({ userId: body.user_id }),
  });
});

// Header submit
app.view("header_submit", async ({ ack, view }) => {
  const vals = view.state.values;
  const incomingMeta = JSON.parse(view.private_metadata || "{}");
  const header = {
    channel: vals.post_channel?.val?.selected_conversation,
    squad: vals.squad?.val?.selected_option?.value,
    roadmap: vals.roadmap_link?.val?.value,
    user: incomingMeta.user,
  };
  const focusVal = vals.focus_rich?.val;
  let focus = "";
  if (focusVal?.value) focus = focusVal.value;
  else if (focusVal?.rich_text_value) focus = richToMrkdwn(focusVal.rich_text_value);
  header.focus = focus;

  const meta = { header, projects: [], user: incomingMeta.user };
  await ack({ response_action: "push", view: projectModal(meta) });
});

// Add another
app.action("add_another", async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;
  const idxKey = Object.keys(vals).find((k) => k.startsWith("p_name_"));
  const idx = Number(idxKey.split("_").pop());

  const name = getBlock(vals, `p_name_${idx}`)?.val?.value;
  const jira = getBlock(vals, `p_jira_${idx}`)?.val?.value;
  const tldrVal = getBlock(vals, `p_tldr_${idx}`)?.val;
  const rag = getBlock(vals, `p_rag_${idx}`)?.val?.selected_option?.value;
  const gtm = getBlock(vals, `p_gtm_${idx}`)?.val?.selected_option?.value;
  const launchQ = getBlock(vals, `p_launchq_${idx}`)?.val?.selected_option?.value;
  const phase = getBlock(vals, `p_phase_${idx}`)?.val?.selected_option?.value;

  let tldr = "";
  if (tldrVal?.value) tldr = tldrVal.value;
  else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);

  meta.projects.push({ name, jira, tldr, rag, gtm, launchQ, phase });
  await client.views.update({ view_id: body.view.id, view: projectModal(meta) });
});

// Back
app.action("back", async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata);
  const last = meta.projects.pop();
  if (!last) return;
  const existing = { ...last, idx: meta.projects.length };
  await client.views.update({ view_id: body.view.id, view: projectModal(meta, existing) });
});

// Done
app.action("done", async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;
  const idxKey = Object.keys(vals).find((k) => k.startsWith("p_name_"));
  const idx = Number(idxKey.split("_").pop());
  const nameBlock = getBlock(vals, `p_name_${idx}`);

  if (nameBlock?.val?.value) {
    const name = nameBlock.val.value;
    const jira = getBlock(vals, `p_jira_${idx}`)?.val?.value;
    const tldrVal = getBlock(vals, `p_tldr_${idx}`)?.val;
    const rag = getBlock(vals, `p_rag_${idx}`)?.val?.selected_option?.value;
    const gtm = getBlock(vals, `p_gtm_${idx}`)?.val?.selected_option?.value;
    const launchQ = getBlock(vals, `p_launchq_${idx}`)?.val?.selected_option?.value;
    const phase = getBlock(vals, `p_phase_${idx}`)?.val?.selected_option?.value;
    let tldr = "";
    if (tldrVal?.value) tldr = tldrVal.value;
    else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);
    meta.projects.push({ name, jira, tldr, rag, gtm, launchQ, phase });
  }

  const blocks = buildMessage(meta.header, meta.projects);
  await postMessageWithJoin(client, meta.header.channel, blocks);

  await client.views.update({
    view_id: body.view.id,
    view: {
      type: "modal",
      title: { type: "plain_text", text: "Done" },
      close: { type: "plain_text", text: "Close" },
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "✅ Your update was posted!" } }],
    },
  });
});

// Save & Post
app.view("project_submit", async ({ ack, view, client }) => {
  const meta = JSON.parse(view.private_metadata);
  const vals = view.state.values;
  const idxKey = Object.keys(vals).find((k) => k.startsWith("p_name_"));
  const idx = Number(idxKey.split("_").pop());

  const name = getBlock(vals, `p_name_${idx}`)?.val?.value;
  const jira = getBlock(vals, `p_jira_${idx}`)?.val?.value;
  const tldrVal = getBlock(vals, `p_tldr_${idx}`)?.val;
  const rag = getBlock(vals, `p_rag_${idx}`)?.val?.selected_option?.value;
  const gtm = getBlock(vals, `p_gtm_${idx}`)?.val?.selected_option?.value;
  const launchQ = getBlock(vals, `p_launchq_${idx}`)?.val?.selected_option?.value;
  const phase = getBlock(vals, `p_phase_${idx}`)?.val?.selected_option?.value;

  let tldr = "";
  if (tldrVal?.value) tldr = tldrVal.value;
  else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);

  if (name) meta.projects.push({ name, jira, tldr, rag, gtm, launchQ, phase });

  await ack();
  const blocks = buildMessage(meta.header, meta.projects);
  await postMessageWithJoin(client, meta.header.channel, blocks);

  await client.views.update({
    view_id: view.id,
    view: {
      type: "modal",
      title: { type: "plain_text", text: "Done" },
      close: { type: "plain_text", text: "Close" },
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "✅ Your update was posted!" } }],
    },
  });
});

// Global error log
app.error((err) => {
  console.error("Bolt App Error:", err);
});

// ---------- Render Free healthcheck ----------
const http = express();
const PORT = process.env.PORT || 3000;
http.get("/", (_req, res) => res.send("OK"));

(async () => {
  await app.start(PORT);
  http.listen(PORT, () => console.log(`HTTP healthcheck on port ${PORT}`));
  console.log("⚡ Maker Update app running (Web Service mode)");
})();
