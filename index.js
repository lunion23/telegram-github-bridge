const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Konfigurasi Environment Variable
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_PAT;
const GITHUB_REPO = process.env.GITHUB_REPO; // Format: username/nama-repo
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // URL otomatis dari Render (contoh: https://nama-app.onrender.com)
const PORT = process.env.PORT || 3000;

// Inisialisasi Express untuk menangani webhook
const app = express();
app.use(express.json());

// Inisialisasi Bot Telegram TANPA polling (menggunakan webhook)
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Otomatis daftarkan webhook ke Telegram saat server menyala
if (RENDER_EXTERNAL_URL) {
  bot.setWebHook(`${RENDER_EXTERNAL_URL}/bot${TELEGRAM_TOKEN}`);
  console.log(`Webhook berhasil dipasang ke: ${RENDER_EXTERNAL_URL}`);
} else {
  console.log("Peringatan: RENDER_EXTERNAL_URL tidak ditemukan. Pastikan diset di environment variables Render.");
}

// Endpoint untuk menerima webhook dari Telegram
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Endpoint dasar agar Render mendeteksi port terbuka
app.get('/', (req, res) => {
  res.send('Bot Telegram Webhook Aktif!');
});

app.listen(PORT, () => {
  console.log(`Server web berjalan pada port ${PORT}`);
});

// Logika saat dokumen (.zip) dikirim ke bot
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const file = msg.document;

  if (!file.file_name.endsWith('.zip')) {
    return bot.sendMessage(chatId, "⚠️ Mohon kirimkan file berformat `.zip`!");
  }

  bot.sendMessage(chatId, `⏳ Menerima file *${file.file_name}*... Sedang mengunggah ke GitHub!`, { parse_mode: 'Markdown' });

  try {
    const fileDetails = await bot.getFile(file.file_id);
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileDetails.file_path}`;

    const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const contentBase64 = Buffer.from(response.data).toString('base64');

    // Bersihkan file ZIP lama di GitHub agar tidak menumpuk/tertukar
    const contentsUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/`;
    try {
      const listRes = await axios.get(contentsUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      
      for (let item of listRes.data) {
        if (item.name.endsWith('.zip') && item.name !== file.file_name) {
          await axios.delete(`https://api.github.com/repos/${GITHUB_REPO}/contents/${item.name}`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` },
            data: {
              message: `Hapus file ZIP lama: ${item.name}`,
              sha: item.sha
            }
          });
        }
      }
    } catch (err) {
      console.log("Catatan saat membersihkan file lama:", err.message);
    }

    let sha = null;
    const repoFileUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file.file_name}`;
    
    try {
      const getFileRes = await axios.get(repoFileUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      sha = getFileRes.data.sha;
    } catch (e) {}

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
