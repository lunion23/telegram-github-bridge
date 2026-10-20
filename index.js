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

    // 3. Bersihkan file ZIP lama di GitHub agar tidak tertukar
    const contentsUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/`;
    try {
      const listRes = await axios.get(contentsUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      });
      
      // Cari dan hapus semua file .zip lama yang ada di root repo
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

    // 4. Cek apakah file dengan nama yang sama sudah ada di GitHub (untuk mendapatkan SHA)
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

    // 5. Unggah file ZIP baru ke Repositori GitHub via API
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
