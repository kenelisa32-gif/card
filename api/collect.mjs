const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// ==================================================
// GET /api/collect
// Simple health check
// ==================================================

export async function GET() {
  return Response.json({
    status: "ok",
    message: "Telegram form server is running",
  });
}

// ==================================================
// POST /api/collect
// Receives the entire submitted form
// ==================================================

export async function POST(request) {
  try {
    // ------------------------------------------------
    // Get Telegram credentials from Vercel
    // environment variables.
    // ------------------------------------------------

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error(
        "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID."
      );

      return new Response(
        "The form server is not configured correctly.",
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }
      );
    }

    // ------------------------------------------------
    // Read the complete form submission
    // ------------------------------------------------

    const formData = await request.formData();

    const textLines = [
      "🔔 NEW WEBSITE FORM SUBMISSION",
      "",
      "FORM DATA",
      "────────────────────────",
    ];

    const uploadedFiles = [];

    // ------------------------------------------------
    // Process EVERY submitted field.
    //
    // This means the server does not need to know
    // the field names in advance.
    // ------------------------------------------------

    for (const [fieldName, fieldValue] of formData.entries()) {

      // ----------------------------------------------
      // Normal text field
      // ----------------------------------------------

      if (typeof fieldValue === "string") {
        textLines.push(
          `${fieldName}: ${cleanValue(fieldValue)}`
        );

        continue;
      }

      // ----------------------------------------------
      // Uploaded file
      // ----------------------------------------------

      uploadedFiles.push(fieldValue);

      textLines.push(
        `${fieldName}: [FILE] ` +
        `${fieldValue.name || "unnamed file"} ` +
        `(${fieldValue.type || "unknown type"}, ` +
        `${fieldValue.size || 0} bytes)`
      );
    }

    // ------------------------------------------------
    // Add submission timestamp
    // ------------------------------------------------

    const receivedAt = new Date().toISOString();

    textLines.push("");
    textLines.push(`Received: ${receivedAt}`);

    const fullMessage = textLines.join("\n");

    // ------------------------------------------------
    // Telegram message limit
    // ------------------------------------------------
    //
    // Keep each message safely below Telegram's
    // 4096-character limit.
    // ------------------------------------------------

    const messageChunks = splitMessage(
      fullMessage,
      3900
    );

    for (const chunk of messageChunks) {
      await sendTelegramMessage(
        botToken,
        chatId,
        chunk
      );
    }

    // ------------------------------------------------
    // Send uploaded files to Telegram
    // ------------------------------------------------

    for (const file of uploadedFiles) {
      await sendTelegramFile(
        botToken,
        chatId,
        file,
        file.name || "uploaded-file"
      );
    }

    // ------------------------------------------------
    // Successful submission
    // ------------------------------------------------

    console.log(
      "Form submission successfully sent to Telegram."
    );

    console.log(
      `Entries processed: ${[...formData.keys()].length}`
    );

    // ------------------------------------------------
    // Redirect the visitor to the success page.
    //
    // The success page does NOT need to exist yet.
    // We'll create it later.
    // ------------------------------------------------

    return new Response(null, {
      status: 303,
      headers: {
        Location: "/success",
      },
    });

  } catch (error) {
    // ------------------------------------------------
    // Something went wrong.
    //
    // IMPORTANT:
    // Do NOT redirect to success.html in this case.
    // ------------------------------------------------

    console.error(
      "Form submission error:",
      error
    );

    return new Response(
      "The form was received, but it could not be processed.",
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
      }
    );
  }
}

// ==================================================
// Send text message to Telegram
// ==================================================

async function sendTelegramMessage(
  botToken,
  chatId,
  text
) {
  const response = await fetch(
    `${TELEGRAM_API_BASE}${botToken}/sendMessage`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    console.error(
      "Telegram sendMessage error:",
      result
    );

    throw new Error(
      result.description ||
      "Telegram message could not be sent."
    );
  }
}

// ==================================================
// Send uploaded file to Telegram
// ==================================================

async function sendTelegramFile(
  botToken,
  chatId,
  file,
  fileName
) {
  const fileBuffer = await file.arrayBuffer();

  const telegramForm = new FormData();

  telegramForm.append(
    "chat_id",
    chatId
  );

  telegramForm.append(
    "document",
    new Blob(
      [fileBuffer],
      {
        type:
          file.type ||
          "application/octet-stream",
      }
    ),
    fileName
  );

  const response = await fetch(
    `${TELEGRAM_API_BASE}${botToken}/sendDocument`,
    {
      method: "POST",
      body: telegramForm,
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    console.error(
      "Telegram sendDocument error:",
      result
    );

    throw new Error(
      result.description ||
      `Telegram could not receive file: ${fileName}`
    );
  }
}

// ==================================================
// Clean submitted text values
// ==================================================

function cleanValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, 10000);
}

// ==================================================
// Split long Telegram messages
// ==================================================

function splitMessage(text, maxLength) {
  const chunks = [];

  let remaining = text;

  while (remaining.length > maxLength) {

    // Prefer splitting at a line break.
    let splitAt = remaining.lastIndexOf(
      "\n",
      maxLength
    );

    // If there is no line break nearby,
    // split at the character limit.
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(
      remaining.slice(0, splitAt)
    );

    remaining = remaining
      .slice(splitAt)
      .trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}