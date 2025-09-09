// Load environment variables from .env file
require('dotenv').config();

const { App } = require("@slack/bolt");
const crypto = require('crypto');
const dayjs = require("dayjs");

// ---------- Utilities ----------
function getBlock(values, prefix) {
  const key = Object.keys(values).find((k) => k.startsWith(prefix));
  return key ? values[key] : undefined;
}

// Manual signature verification for slash commands
function verifySlackSignature(signature, timestamp, body, signingSecret) {
  console.log('Verifying signature with:', { signature, timestamp, body: body.substring(0, 100) + '...', signingSecret: signingSecret.substring(0, 8) + '...' });
  
  // Check if request is too old (replay attack protection)
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);
  if (Math.abs(currentTime - requestTime) > 300) { // 5 minutes
    console.error('Request too old:', { currentTime, requestTime, diff: Math.abs(currentTime - requestTime) });
    return false;
  }
  
  const baseString = `v0:${timestamp}:${body}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');
  
  console.log('Expected signature:', expectedSignature);
  console.log('Base string:', baseString.substring(0, 100) + '...');
  console.log('Current time:', currentTime, 'Request time:', requestTime);
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
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
const SQUADS = [
  "Clarity",
  "Comms & Login",
  "Communications Platform",
  "Customer Delight",
  "Payment Differentiation",
  "Payment Workflows",
  "Payments Platform",
];

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
          options: SQUADS.map((s) => ({
            text: { type: "plain_text", text: s },
            value: s,
          })),
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
        element: { 
          type: "rich_text_input", 
          action_id: "val",
          initial_value: existing?.tldrRichText || undefined
        },
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

// ---------- Simple Lambda Handler ----------
exports.handler = async (event, context) => {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    // Check if this is a slash command
    if (event.httpMethod === 'POST' && event.path === '/slack/events' && event.body) {
      const contentType = event.headers['Content-Type'] || event.headers['content-type'];
      
      if (contentType === 'application/x-www-form-urlencoded') {
        // This is a slash command - handle it directly
        const signature = event.headers['X-Slack-Signature'] || event.headers['x-slack-signature'];
        const timestamp = event.headers['X-Slack-Request-Timestamp'] || event.headers['x-slack-request-timestamp'];
        
        console.log('Slash command detected:', { signature, timestamp });
        
        // Verify signature
        if (!verifySlackSignature(signature, timestamp, event.body, process.env.SLACK_SIGNING_SECRET)) {
          console.error('Invalid signature');
          return {
            statusCode: 401,
            body: JSON.stringify({ error: "Unauthorized" })
          };
        }
        
        // Parse the form data
        const params = new URLSearchParams(event.body);
        const body = Object.fromEntries(params);
        
        console.log('Parsed slash command body:', body);
        
        // Check if it's our slash command
        if (body.command === '/maker-biweekly-update') {
          // Create a simple app instance for the slash command
          const app = new App({
            token: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret-for-initialization',
            processBeforeResponse: true,
          });
          
          // Open the modal directly
          try {
            const result = await app.client.views.open({
              token: process.env.SLACK_BOT_TOKEN,
              trigger_id: body.trigger_id,
              view: headerModal({ userId: body.user_id }),
            });
            
            console.log('Modal opened successfully:', result);
            
            return {
              statusCode: 200,
              body: JSON.stringify({ response_type: 'ephemeral', text: 'Opening biweekly update form...' })
            };
          } catch (error) {
            console.error('Error opening modal:', error);
            return {
              statusCode: 500,
              body: JSON.stringify({ error: "Failed to open modal" })
            };
          }
        }
      }
    }
    
    // For other events, return 404
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not found" })
    };
    
  } catch (error) {
    console.error("Lambda handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};