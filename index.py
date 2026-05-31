import os
import json
import datetime
import http.server
import threading
from discord.ext import tasks, commands
import discord

# سيرفر وهمي لتخطي مشكلة البورت
class WebServer(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Bot is online!")

def run_server():
    port = int(os.environ.get("PORT", 3000))
    http.server.HTTPServer(("0.0.0.0", port), WebServer).serve_forever()

threading.Thread(target=run_server, daemon=True).start()

# إعداد البوت
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

# إعدادات ثابتة
DB_FILE = "bank_data.json"
BOT_TOKEN = os.environ.get("DISCORD_TOKEN")

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"✅ {bot.user.name} يعمل الآن بكفاءة!")

# أمر بسيط للتجربة
@bot.tree.command(name="ping", description="فحص سرعة البوت")
async def ping(interaction: discord.Interaction):
    await interaction.response.send_message(f"🏓 Pong! {round(bot.latency * 1000)}ms")

bot.run(BOT_TOKEN)
