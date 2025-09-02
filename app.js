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

// Convert Slack rich_text to mrkdwn, preserving bullets, links, emoji, mentions
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

// Format roadmap URL as a clean hyperlink (<url|Link>)
function formatRoadmap(url) {
  if (!url) return "";
  const isUrl = /^https?:\/\//i.test(url);
  const safe = isUrl ? url : `https://${url}`;
  return `<${safe}|Link>`;
}

// Emoji for RAG
const RAG_EMOJI = { Green: "🟢", Yellow: "🟡", Red: "🔴" };

// ---------- UI BUILDERS ----------
function headerModal({ userId } = {}) {
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
        block_id: "date",
        label: { type: "plain_text", text: "Date" },
        element: {
          type: "datepicker",
          initial_date: dayjs().format("YYYY-MM-DD"),
          action_id: "val",
        },
      },
      {
        type: "input",
        block_id: "name_user",
        label: { type: "plain_text", text: "Your Slack user" },
        element: { type: "users_select", initial_user: userId, action_id: "val" },
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
        // REQUIRED roadmap link
        type: "input",
        block_id: "roadmap_link",
        optional: false,
        label: { type: "plain_text", text: "Link to roadmap or project tracker" },
        element: {
          type: "plain_text_input",
          action_id: "val",
          placeholder: {
            type: "plain_text",
            text: "Paste the URL (e.g., https://…)",
          },
        },
      },
      {
        // REQUIRED rich-text summary
        type: "input",
        block_id: "focus_rich",
        optional: false,
        label: { type: "plain_text", text: "Summary of focus areas this sprint" },
        element: {
          type: "rich_text_input",
          action_id: "val",
        },
      },
    ],
    private_metadata: JSON.stringify({ projects: [] }),
  };
}

const RAG = ["Green", "Yellow", "Red"];
const GTM = ["Discovery", "Alpha", "Beta", "GA"];
const PHASE = ["Design", "Build", "QA", "Deploy"];

function projectModal(meta) {
  const idx = meta.projects.length;
  return {
    type: "modal",
    callback_id: "project_submit",
    title: { type: "plain_text", text: `Project ${idx + 1}` },
    submit: { type: "plain_text", text: "Save & Post" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Add one project, then click* *Add another* *or* *Done*." },
      },
      {
        type: "input",
        block_id: `p_name_${idx}`,
        label: { type: "plain_text", text: "Project name" },
        element: { type: "plain_text_input", action_id: "val" },
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
          options: GTM.map((g) => ({ text: { type: "plain_text", text: g }, value: g })),
        },
      },
      {
        type: "input",
        optional: true,
        block_id: `p_launch_${idx}`,
        label: { type: "plain_text", text: "Target launch date" },
        element: { type: "datepicker", action_id: "val" },
      },
      {
        type: "input",
        block_id: `p_phase_${idx}`,
        label: { type: "plain_text", text: "Phase" },
        element: {
          type: "static_select",
          action_id: "val",
          options: PHASE.map((p) => ({ text: { type: "plain_text", text: p }, value: p })),
        },
      },
      {
        type: "actions",
        block_id: `next_action_${idx}`,
        elements: [
          { type: "button", text: { type: "plain_text", text: "➕ Add another" }, action_id: "add_another", style: "primary" },
          { type: "button", text: { type: "plain_text", text: "✅ Done" }, action_id: "done" },
        ],
      },
    ],
    private_metadata: JSON.stringify(meta),
  };
}

// Build final message
function buildMessage(header, projects) {
  const submittedBy = header.user ? `<@${header.user}>` : header.name || "(unknown)";
  const head =
    `*🍫 MAKER BIWEEKLY UPDATE*\n` +
    `*Date:* ${header.date}   *Submitted by:* ${submittedBy}\n` +
    `*Squad:* ${header.squad}` +
    (header.roadmap ? `   *Roadmap:* ${formatRoadmap(header.roadmap)}` : "") +
    `\n\n*SUMMARY OF FOCUS AREAS THIS SPRINT*\n${header.focus || "_(none provided)_"}\n\n*PROJECT UPDATES*`;

  const blocks = [{ type: "section", text: { type: "mrkdwn", text: head } }, { type: "divider" }];

  projects.forEach((p, i) => {
    const ragIcon = RAG_EMOJI[p.rag] || "";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${i === 0 ? "💥" : "💡"} ${p.name}*\n` +
          (p.tldr ? `*TL;DR*\n${p.tldr}\n` : "") + // label on its own line so bullets render nicely
          `*RAG:* ${ragIcon} ${p.rag}   *GTM:* ${p.gtm}` +
          (p.launch ? `   *Target launch:* ${p.launch}` : "") +
          `\n*Phase:* ${p.phase}`,
      },
    });
    blocks.push({ type: "divider" });
  });
  return blocks;
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

// Header submit -> push first Project modal
app.view("header_submit", async ({ ack, view }) => {
  const vals = view.state.values;
  // Roadmap (required plain text), Summary (required rich text)
  const roadmap = vals.roadmap_link?.val?.value;

  const focusVal = vals.focus_rich?.val;
  let focus = "";
  if (focusVal?.value) focus = focusVal.value;
  else if (focusVal?.rich_text_value) focus = richToMrkdwn(focusVal.rich_text_value);

  const header = {
    channel: vals.post_channel?.val?.selected_conversation,
    date: vals.date?.val?.selected_date,
    user: vals.name_user?.val?.selected_user,
    squad: vals.squad?.val?.selected_option?.value,
    roadmap,
    focus,
  };
  const meta = { header, projects: [] };
  await ack({ response_action: "push", view: projectModal(meta) });
});

// Add another project
app.action("add_another", async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;

  const name = getBlock(vals, "p_name_")?.val?.value;
  const tldrVal = getBlock(vals, "p_tldr_")?.val;
  const rag = getBlock(vals, "p_rag_")?.val?.selected_option?.value;
  const gtm = getBlock(vals, "p_gtm_")?.val?.selected_option?.value;
  const launch = getBlock(vals, "p_launch_")?.val?.selected_date;
  const phase = getBlock(vals, "p_phase_")?.val?.selected_option?.value;

  let tldr = "";
  if (tldrVal?.value) tldr = tldrVal.value;
  else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);

  meta.projects.push({ name, tldr, rag, gtm, launch, phase });
  await client.views.update({ view_id: body.view.id, view: projectModal(meta) });
});

// Done -> include current project (if filled) and post to channel
app.action("done", async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;

  const nameBlock = getBlock(vals, "p_name_");
  if (nameBlock?.val?.value) {
    const name = nameBlock.val.value;
    const tldrVal = getBlock(vals, "p_tldr_")?.val;
    const rag = getBlock(vals, "p_rag_")?.val?.selected_option?.value;
    const gtm = getBlock(vals, "p_gtm_")?.val?.selected_option?.value;
    const launch = getBlock(vals, "p_launch_")?.val?.selected_date;
    const phase = getBlock(vals, "p_phase_")?.val?.selected_option?.value;

    let tldr = "";
    if (tldrVal?.value) tldr = tldrVal.value;
    else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);

    meta.projects.push({ name, tldr, rag, gtm, launch, phase });
  }

  const blocks = buildMessage(meta.header, meta.projects);
  await client.chat.postMessage({ channel: meta.header.channel, blocks, text: "Maker Biweekly Update" });

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

// Handle "Save & Post" submission
app.view("project_submit", async ({ ack, body, view, client }) => {
  const meta = JSON.parse(view.private_metadata);
  const vals = view.state.values;

  const name = getBlock(vals, "p_name_")?.val?.value;
  const tldrVal = getBlock(vals, "p_tldr_")?.val;
  const rag = getBlock(vals, "p_rag_")?.val?.selected_option?.value;
  const gtm = getBlock(vals, "p_gtm_")?.val?.selected_option?.value;
  const launch = getBlock(vals, "p_launch_")?.val?.selected_date;
  const phase = getBlock(vals, "p_phase_")?.val?.selected_option?.value;

  let tldr = "";
  if (tldrVal?.value) tldr = tldrVal.value;
  else if (tldrVal?.rich_text_value) tldr = richToMrkdwn(tldrVal.rich_text_value);

  if (name) meta.projects.push({ name, tldr, rag, gtm, launch, phase });

  await ack();

  const blocks = buildMessage(meta.header, meta.projects);
  await client.chat.postMessage({ channel: meta.header.channel, blocks, text: "Maker Biweekly Update" });

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
