const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Konfigurasi Environment Variable
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_PAT;
const GITHUB_REPO = process.env.GITHUB_REPO; // Format: username/nama-repo

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log("Bot jembatan Telegram-GitHub aktif...");

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const file = msg.document;

  // Pastikan file yang dikirim berformat .zip
  if (!file.file_name.endsWith('.zip')) {
    return bot.sendMessage(chatId, "⚠️ Mohon kirimkan file berformat `.zip`!");
  }

  bot.sendMessage(chatId, `⏳ Menerima file *${file.file_name}*... Sedang mengunggah ke GitHub!`, { parse_mode: 'Markdown' });

  try {
    // 1. Dapatkan link unduhan file dari server Telegram
    const fileDetails = await bot.getFile(file.file_id);
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileDetails.file_path}`;

    // 2. Unduh file ZIP sebagai Buffer
    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const contentBase64 = Buffer.from(response.data).toString('base64');

    // 3. Cek apakah file dengan nama yang sama sudah ada di GitHub (untuk mendapatkan SHA jika update)
    let sha = null;
    const repoFileUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file.file_name}`;
    
    try {
      const getFileRes = await axios.get(repoFileUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      sha = getFileRes.data.sha;
    } catch (e) {
      // File belum ada di repo, abaikan error
    }

    // 4. Unggah/Replace file ZIP ke Repositori GitHub via API
    await axios.put(repoFileUrl, {
      message: `Upload via Telegram Bot: ${file.file_name}`,
      content: contentBase64,
      sha: sha
    }, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });

    bot.sendMessage(
      chatId, 
      `🚀 *File ${file.file_name} berhasil diunggah ke GitHub!*%0A%0AProses *Build APK* otomatis dimulai. Mohon tunggu beberapa menit, file APK akan dikirimkan ke sini setelah selesai!`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, `❌ Gagal mengunggah file ke GitHub: ${error.message}`);
  }
});
