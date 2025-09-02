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
        // Slack mention picker for the user's name
        type: "input",
        block_id: "name_user",
        label: { type: "plain_text", text: "Your Slack user" },
        element: {
          type: "users_select",
          initial_user: userId,
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
        optional: true,
        block_id: "roadmap",
        label: { type: "plain_text", text: "Link to roadmap or project tracker" },
        element: { type: "plain_text_input", action_id: "val" },
      },
      {
        type: "input",
        optional: true,
        block_id: "focus",
        label: { type: "plain_text", text: "Summary of focus areas this sprint" },
        element: {
          type: "plain_text_input",
          multiline: true,
          action_id: "val",
          // Emojis and bullets are supported in mrkdwn when we post
          placeholder: { type: "plain_text", text: "You can use emojis (:rocket:) and bullets (-, •) here" },
        },
      },
    ],
    private_metadata: JSON.stringify({ projects: [] }),
  };
}

const RAG = ["Green", "Yellow", "Red"];
const GTM = ["Discovery", "Alpha", "Beta", "GA"];
const PHASE = ["Design", "Build", "QA", "Deploy"];

/** A fresh (cleared) project modal every time */
function projectModal(meta) {
  return {
    type: "modal",
    callback_id: "project_submit",
    title: { type: "plain_text", text: `Project ${meta.projects.length + 1}` },
    submit: { type: "plain_text", text: "Save" }, // keeps Slack happy
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Add one project, then click* *Add another* *or* *Done*." },
      },
      {
        type: "input",
        block_id: "p_name",
        label: { type: "plain_text", text: "Project name" },
        element: { type: "plain_text_input", action_id: "val", initial_value: "" }, // clear
      },
      {
        type: "input",
        block_id: "p_tldr",
        label: { type: "plain_text", text: "TL;DR" },
        element: {
          type: "plain_text_input", // emojis & bullets render fine in the final message
          multiline: true,
          action_id: "val",
          initial_value: "", // clear
        },
      },
      {
        type: "input",
        block_id: "p_rag",
        label: { type: "plain_text", text: "RAG status" },
        element: {
          type: "static_select",
          action_id: "val",
          options: RAG.map((r) => ({ text: { type: "plain_text", text: r }, value: r })),
          // no initial_option -> clear
        },
      },
      {
        type: "input",
        block_id: "p_gtm",
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
        block_id: "p_launch",
        label: { type: "plain_text", text: "Target launch date" },
        element: { type: "datepicker", action_id: "val" }, // no initial_date -> clear
      },
      {
        type: "input",
        block_id: "p_phase",
        label: { type: "plain_text", text: "Phase" },
        element: {
          type: "static_select",
          action_id: "val",
          options: PHASE.map((p) => ({ text: { type: "plain_text", text: p }, value: p })),
        },
      },
      {
        type: "actions",
        block_id: "next_action",
        elements: [
          { type: "button", text: { type: "plain_text", text: "➕ Add another" }, action_id: "add_another", style: "primary" },
          { type: "button", text: { type: "plain_text", text: "✅ Done" }, action_id: "done" },
        ],
      },
    ],
    private_metadata: JSON.stringify(meta),
  };
}

/** Compose the final message blocks */
function buildMessage(header, projects) {
  const submittedBy = header.user ? `<@${header.user}>` : header.name || "(unknown)";
  const head =
    `*🧱 MAKER BIWEEKLY UPDATE*\n` +
    `*Date:* ${header.date}   *Submitted by:* ${submittedBy}\n` +
    `*Squad:* ${header.squad}` +
    (header.roadmap ? `   *Roadmap:* ${header.roadmap}` : "") +
    `\n\n*SUMMARY OF FOCUS AREAS THIS SPRINT*\n${header.focus || "_(none provided)_"}\n\n*PROJECT UPDATES*`;

  const blocks = [{ type: "section", text: { type: "mrkdwn", text: head } }, { type: "divider" }];

  projects.forEach((p, i) => {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${i === 0 ? "💥" : "💡"} ${p.name}*\n` +
          `${p.tldr ? `*TL;DR:* ${p.tldr}\n` : ""}` +
          `*RAG:* ${p.rag}   *GTM:* ${p.gtm}` +
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
  console.log("Slash command received");
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: headerModal({ userId: body.user_id }),
  });
});

// Header submit -> push first Project modal
app.view("header_submit", async ({ ack, view }) => {
  console.log("Header submit received");
  const vals = view.state.values;
  const header = {
    channel: vals.post_channel.val.selected_conversation,
    date: vals.date.val.selected_date,
    user: vals.name_user.val.selected_user, // store user id for proper mention
    squad: vals.squad.val.selected_option.value,
    roadmap: vals.roadmap?.val?.value,
    focus: vals.focus?.val?.value,
  };
  const meta = { header, projects: [] };

  await ack({ response_action: "push", view: projectModal(meta) });
});

// Add another project
app.action("add_another", async ({ ack, body, client }) => {
  await ack();
  console.log("Add another clicked");
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;

  meta.projects.push({
    name: vals.p_name.val.value,
    tldr: vals.p_tldr.val.value,
    rag: vals.p_rag.val.selected_option.value,
    gtm: vals.p_gtm.val.selected_option.value,
    launch: vals.p_launch?.val?.selected_date,
    phase: vals.p_phase.val.selected_option.value,
  });

  await client.views.update({ view_id: body.view.id, view: projectModal(meta) });
});

// Done -> post to channel
app.action("done", async ({ ack, body, client }) => {
  await ack();
  console.log("Done clicked");
  const meta = JSON.parse(body.view.private_metadata);
  const vals = body.view.state.values;

  // If user filled the current modal, include it too
  if (vals.p_name?.val?.value) {
    meta.projects.push({
      name: vals.p_name.val.value,
      tldr: vals.p_tldr.val.value,
      rag: vals.p_rag.val.selected_option.value,
      gtm: vals.p_gtm.val.selected_option.value,
      launch: vals.p_launch?.val?.selected_date,
      phase: vals.p_phase.val.selected_option.value,
    });
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
