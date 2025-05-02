// Use dynamic imports
import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Load environment variables
dotenv.config();

// API URLs
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Paths
const DOWNLOAD_PATH = "./downloads";  // Folder to store images

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

let isImageMode = false;
let BOT_USERNAME = '';

// Get bot username on launch
bot.telegram.getMe().then((botInfo) => {
  BOT_USERNAME = botInfo.username;
  console.log("🤖 Bot username is:", BOT_USERNAME);
});

// Function to get chat response from OpenAI
const getChatResponse = async (text) => {
  try {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: text }],
      }),
    });

    const data = await response.json();

    if (response.ok && data.choices) {
      return data.choices[0].message.content;
    } else {
      console.error("Chat API Error:", data);
      return "🚨 Error: Unable to get a response. Try again later.";
    }
  } catch (error) {
    console.error("Chat API Fetch Error:", error);
    return "⚠️ An unexpected error occurred while processing your request.";
  }
};

// Function to generate image using DeepAI
const generateImage = async (text) => {
  try {
    const response = await fetch('https://api.deepai.org/api/text2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.DEEPAI_API_KEY,
      },
      body: JSON.stringify({
        text: text,
      }),
    });

    const data = await response.json();

    if (data && data.output_url) {
      return data.output_url;
    } else {
      console.error("DeepAI API Error:", data);
      return "🚨 Error: Failed to generate image with DeepAI. Try again!";
    }
  } catch (error) {
    console.error("DeepAI API Fetch Error:", error);
    return "⚠️ An unexpected error occurred while generating the image.";
  }
};

// Function to get file URL from Telegram
const getFileUrl = async (fileId) => {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (data.ok) {
      return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    }
    return null;
  } catch (error) {
    console.error("Error fetching file URL:", error);
    return null;
  }
};

const downloadImage = async (url, filename) => {
  if (!fs.existsSync(DOWNLOAD_PATH)) {
    fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
  }

  const response = await fetch(url);
  const buffer = await response.buffer();
  const filePath = `${DOWNLOAD_PATH}/${filename}`;

  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// Function to remove background from a local image
const removeBackgroundLocal = async (filePath) => {
  try {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath));

    const response = await fetch('https://api.deepai.org/api/background-remover', {
      method: 'POST',
      headers: { 'api-key': process.env.DEEPAI_API_KEY },
      body: formData,
    });

    const data = await response.json();
    return data.output_url ? data.output_url : null;
  } catch (error) {
    console.error("DeepAI API Fetch Error:", error);
    return null;
  }
};

// Send buttons to user
bot.start((ctx) => {
  ctx.reply(
    "This is not a serious creation but an AI tool that can do almost anything for you while on tg. You don't have to go anywhere, I love your presence. With love from $spirit.",
  );
  ctx.reply(
    "Welcome! Choose a mode:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📝 Talk to Spirit", "set_chat")],
      [Markup.button.callback("🖼️ Draw with Spirit", "set_image")],
      [Markup.button.callback("What did Dev do", "connect")]
    ])
  );
});

// Handle button clicks
bot.action("set_chat", (ctx) => {
  isImageMode = false;
  ctx.reply("✅ Ask a question?");
});

bot.action("set_image", (ctx) => {
  isImageMode = true;
  ctx.reply("✅ What can I draw for you?");
});

bot.action("help", (ctx) => {
  const helpMessage = `
  🤖 Bot Guide

  1. Chat Mode: Click the *Chat Mode* button to interact with the bot and get text-based responses using GPT-3.

  2. Image Mode: Click the *Image Mode* button to generate an image. Send a text prompt, and the bot will create an image using DeepAI.

  3. Background Removal: To use the background remover:
     - First, click *Image Mode*.
     - Then, upload an image.
     - The bot will process your image and remove the background.

  4. Switch Between Modes: You can switch between **Chat Mode** and **Image Mode** at any time by clicking the buttons.

  📩 If you encounter any issues, feel free to reach out for support!

  Enjoy your experience with the bot!`;

  ctx.reply(helpMessage);
});

// Handle text messages
// Handle text messages
bot.on("text", async (ctx) => {
  const chatType = ctx.chat.type;
  const messageText = ctx.message.text.toLowerCase(); // Normalize to lowercase for easier keyword matching

  // In group chats, only respond when tagged
  if ((chatType === 'group' || chatType === 'supergroup') &&
      !messageText.includes(`@${BOT_USERNAME.toLowerCase()}`)) {
    return; // Ignore if not tagged
  }

  try {
    await ctx.reply("⏳ Processing...");

    // Determine mode based on message content
    const shouldDraw = messageText.includes("draw") || messageText.includes("image");

    if (shouldDraw) {
      const imageUrl = await generateImage(messageText);
      await ctx.replyWithPhoto(imageUrl);
    } else {
      const response = await getChatResponse(messageText);
      await ctx.reply(response);
    }
  } catch (error) {
    console.error("Message Handling Error:", error);
    ctx.reply("🚨 An error occurred while processing your request. Please try again.");
  }
});

// Handle image uploads
bot.on("photo", async (ctx) => {
  ctx.reply("⏳ Processing your image...");

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const fileUrl = await getFileUrl(fileId);

  if (!fileUrl) {
    return ctx.reply("🚨 Error: Could not retrieve the image. Please try again.");
  }

  const localFilePath = await downloadImage(fileUrl, `${Date.now()}.jpg`);

  const bgRemovedUrl = await removeBackgroundLocal(localFilePath);

  if (bgRemovedUrl) {
    ctx.replyWithPhoto(bgRemovedUrl);
  } else {
    ctx.reply("🚨 Error: Failed to remove background.");
  }
});

// Start the bot
bot.launch();
console.log("🤖 Bot is running...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
