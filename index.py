#!/usr/bin/env python3
import os
import json
import datetime
import http.server
import threading
from discord.ext import tasks, commands
import discord

# ─── إنشاء سيرفر وهمي لتخطي مشكلة البورت في رندر (Python) ───
class WebServer(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Bot is running online!\n".encode("utf-8"))

def run_server():
    port = int(os.environ.get("PORT", 3000))
    server = http.server.HTTPServer(("0.0.0.0", port), WebServer)
    print(f"🌐 السيرفر الوهمي يعمل على بورت: {port}")
    server.serve_forever()

# تشغيل السيرفر في خلفية النظام
threading.Thread(target=run_server, daemon=True).start()

# ─── إعدادات البوت والـ Intents ───
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
bot = commands.Bot(command_prefix="/", intents=intents)

DB_FILE = "bank_data.json"
SUPPORT_GUILD_ID = 1510395297279508620  
ADMIN_USER_ID = 1306034100544737461
ADMIN_ROLE_ID = 1510396218482757744
LOG_ROOM_EXPIRED = 1510397908653047848
LOG_ROOM_SUCCESS = 1510398868510998708

# قراءة التوكن من رندر
BOT_TOKEN = os.environ.get("DISCORD_TOKEN") or os.environ.get("BOT_TOKEN")

# ─── دالات قاعدة البيانات ───
def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {"users": {}, "loans": {}}
    return {"users": {}, "loans": {}}

def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def get_user_status(user_id, db):
    return db["users"].get(str(user_id), {}).get("status", "طبيعي")

async def check_admin_permission(interaction: discord.Interaction):
    if interaction.user.id == ADMIN_USER_ID:
        return True
    try:
        guild = bot.get_guild(SUPPORT_GUILD_ID) or await bot.fetch_guild(SUPPORT_GUILD_ID)
        member = guild.get_member(interaction.user.id) or await guild.fetch_member(interaction.user.id)
        if member and any(role.id == ADMIN_ROLE_ID for role in member.roles):
            return True
    except:
        return False
    return False

# ─── أحداث البوت ───
@bot.event
async def on_ready():
    print("========================================")
    print(f"🏦 تم تشغيل نظام السلف المركزي بنجاح (Python)!")
    print(f"🤖 الحساب المعرف: {bot.user.name}")
    print("========================================")
    try:
        await bot.tree.sync()
        print("🚀 تم مزامنة أوامر الـ Slash Commands بنجاح!")
    except Exception as e:
        print(f"خطأ في المزامنة: {e}")
    clean_expired_loans.start()

# ─── أوامر الـ Slash Commands ───

# 1. أمر المساعدة
@bot.tree.command(name="help", description="عرض دليل استخدام نظام السلف (مخفي للآخرين).")
async def help_command(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    embed = discord.Embed(
        title="🏦 نظام السلف والائتمان المركزي",
        description="أهلاً بك في نظام الضمان المالي المتقدم.\n\n💡 **إذا كنت ترغب بطلب سلف أو استدانة كريدات من شخص آخر، يرجى استخدام الأمر التالي:**\n👉 `/salafni`",
        color=0x0099FF
    )
    await interaction.followup.send(embed=embed)

# 2. أمر طلب سلف
@bot.tree.command(name="salafni", description="تقديم طلب سلف من شخص محدد مع ذكر السبب والمبلغ.")
@discord.app_commands.describe(المبلغ="كمية الكريدت المطلوبة", الشخص="الشخص المراد الاستدانة منه", السبب="سبب طلب السلف")
async def salafni(interaction: discord.Interaction, المبلغ: int, الشخص: discord.User, السبب: str):
    await interaction.response.defer(ephemeral=True)
    db = load_db()
    
    if get_user_status(interaction.user.id, db) == "محروم":
        return await interaction.followup.send("❌ عذراً، أنت مدرج في القائمة السوداء ومحروم من التسلف حالياً.")
    if get_user_status(الشخص.id, db) == "محروم":
        return await interaction.followup.send("❌ هذا الشخص محروم من التعاملات المالية حالياً.")
    if الشخص.id == interaction.user.id:
        return await interaction.followup.send("❌ لا يمكنك طلب سلف من نفسك!")

    # أزرار القبول والرفض للبايثون
    class LoanButtons(discord.ui.View):
        def __init__(self):
            super().__init__(timeout=None)
            
        @discord.ui.button(label="نعم، أوافق على إقراضه", style=discord.ButtonStyle.success, custom_id=f"acc_{interaction.user.id}_{المبلغ}")
        async def accept(self, button_interaction: discord.Interaction, button: discord.ui.Button):
            await button_interaction.response.defer()
            db_click = load_db()
            loan_id = f"{interaction.user.id}_{button_interaction.user.id}_{int(datetime.datetime.now().timestamp())}"
            expire_date = (datetime.datetime.now() + datetime.timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
            
            db_click["loans"][loan_id] = {
                "borrower_id": str(interaction.user.id),
                "lender_id": str(button_interaction.user.id),
                "amount": المبلغ,
                "reason": "تم القبول عبر الخاص",
                "expire_at": expire_date
            }
            save_db(db_click)
            
            await button_interaction.followup.send(f"✅ **قمت بقبول الطلب بنجاح. الطرف الآخر لديه شهر واحد فقط للتسديد.**\n[اضغط هنا للتحدث للدعم](https://discord.gg/nQyHR8T3xs)")
            self.stop()
            
            try:
                await interaction.user.send(f"🎉 تم قبول طلب السلف الخاص بك من قِبل {button_interaction.user.name}. المبلغ: {المبلغ:,} كريدت. الموعد النهائي للسداد هو خلال 30 يوماً.")
            except: pass
            try:
                chan = bot.get_channel(LOG_ROOM_SUCCESS) or await bot.fetch_channel(LOG_ROOM_SUCCESS)
                if chan: await chan.send(f"🤝 **عملية ناجحة:** تمت عملية استسلاف بين {interaction.user.mention} و {button_interaction.user.mention} بمبلغ {المبلغ:,} كريدت.")
            except: pass

        @discord.ui.button(label="رفض الطلب", style=discord.ButtonStyle.danger, custom_id=f"dec_{interaction.user.id}")
        async def decline(self, button_interaction: discord.Interaction, button: discord.ui.Button):
            await button_interaction.response.send_message("❌ لقد قمت برفض هذا السلف المالي.")
            self.stop()
            try:
                await interaction.user.send(f"❌ نعتذر منك، لقد تم رفض طلب السلف المقدم إلى {button_interaction.user.name}.")
            except: pass

    embed = discord.Embed(
        title="📩 طلب سلف مالي جديد وارد إليك",
        description=f"أهلاً بك، هناك عضو يطلب منك سلفاً مالياً.\n\n👤 **مقدم الطلب:** {interaction.user.mention}\n💰 **المبلغ:** {المبلغ:,} كريدت\n📝 **السبب:** {السبب}",
        color=0xFFD700
    )
    try:
        await الشخص.send(embed=embed, view=LoanButtons())
        await interaction.followup.send(f"⏳ **تم إرسال طلب السلف إلى {الشخص.mention} في الخاص بنجاح...**")
    except:
        await interaction.followup.send(f"❌ تعذر إرسال الرسالة إلى الشخص لأن حساب الخاص لديه مغلق!")

# 3. أمر إلغاء السلف
@bot.tree.command(name="إلغاء_السلف", description="إلغاء معاملة سلف جارية بالتراضي بين الطرفين.")
@discord.app_commands.describe(الشخص="الشخص المعني بالمعاملة")
async def cancel_loan(interaction: discord.Interaction, الشخص: discord.User):
    await interaction.response.defer()
    db = load_db()
    loan_id = None
    
    for lid, loan in db["loans"].items():
        if (loan["borrower_id"] == str(interaction.user.id) and loan["lender_id"] == str(الشخص.id)) or \
           (loan["borrower_id"] == str(الشخص.id) and loan["lender_id"] == str(interaction.user.id)):
            loan_id = lid
            break
            
    if not loan_id:
        return await interaction.followup.send("❌ لا توجد معاملة سلف جارية وقائمة بينك وبين هذا الشخص حالياً.")
        
    if db["loans"][loan_id]["lender_id"] == str(interaction.user.id):
        del db["loans"][loan_id]
        save_db(db)
        await interaction.followup.send("✅ تم إلغاء السلف المالي بينكما وإسقاطه فوراً من طرف المقرِض.")
        try: await الشخص.send(f"⚠️ أحببنا إشعارك بأن {interaction.user.name} قام بإلغاء وإسقاط السلف المالي القائم بينكما رسمياً.")
        except: pass
        return

    class CancelView(discord.ui.View):
        @discord.ui.button(label="موافقة على الإلغاء", style=discord.ButtonStyle.success)
        async def confirm(self, b_interaction: discord.Interaction, button: discord.ui.Button):
            db_c = load_db()
            if loan_id in db_c["loans"]:
                del db_c["loans"][loan_id]
                save_db(db_c)
                await b_interaction.response.send_message("✅ تم تأكيد موافقتك وإلغاء السلف بالكامل بين الطرفين.")
                try: await interaction.user.send(f"✅ وافق {b_interaction.user.name} على إلغاء السلف، وأغلقت القضية.")
                except: pass
            else:
                await b_interaction.response.send_message("❌ المعاملة لم تعد موجودة.")
                
    try:
        await الشخص.send(f"❓ يطلب {interaction.user.mention} إلغاء السلف القائم والمشترك بينكما، هل توافق؟", view=CancelView())
        await interaction.followup.send("⏳ تم إرسال طلب إلغاء السلف إلى الطرف الآخر للموافقة والتأكيد.")
    except:
        await interaction.followup.send("❌ فشل إرسال الطلب لأن خاص الطرف الآخر مغلق.")

# 4. أمر الدفع والتسديد
@bot.tree.command(name="الدفع", description="تسديد مستحقات مالية وإيقاف نظام السلف.")
@discord.app_commands.describe(الشخص="المقرض الذي تريد السداد له")
async def pay_loan(interaction: discord.Interaction, الشخص: discord.User):
    await interaction.response.defer()
    db = load_db()
    loan_id = None
    
    for lid, loan in db["loans"].items():
        if loan["borrower_id"] == str(interaction.user.id) and loan["lender_id"] == str(الشخص.id):
            loan_id = lid
            break
            
    if not loan_id:
        return await interaction.followup.send("❌ لا يوجد سلف مسجل عليك لهذا الشخص لتدفعه.")

    class PayView(discord.ui.View):
        @discord.ui.button(label="نعم، استلمت أموالي بالكامل", style=discord.ButtonStyle.success)
        async def yes(self, b_interaction: discord.Interaction, button: discord.ui.Button):
            db_p = load_db()
            if loan_id in db_p["loans"]:
                del db_p["loans"][loan_id]
                save_db(db_p)
                await b_interaction.response.send_message("✅ تم تأكيد الاستلام المالي وأغلق السلف بنجاح.")
                try: await interaction.user.send("🎉 تم إغلاق وتأكيد سداد السلف الخاص بك بنجاح، شكراً لالتزامك!")
                except: pass
            else:
                await b_interaction.response.send_message("❌ المعاملة لم تعد موجودة.")

        @discord.ui.button(label="لا، لم أستلم شيء", style=discord.ButtonStyle.danger)
        async def no(self, b_interaction: discord.Interaction, button: discord.ui.Button):
            await b_interaction.response.send_message("❌ تم رفض التأكيد. يرجى مراجعة الدعم الفني.")
            try: await interaction.user.send("❌ أفاد المقرض بأنه لم يستلم الكريدات. إذا واجهت مشكلة يرجى التوجه لمركز الدعم.")
            except: pass

    try:
        await الشخص.send(f"🔔 يدّعي {interaction.user.mention} أنه قام بسداد كامل الدين المستحق لك، هل تؤكد استلام الكريدات؟", view=PayView())
        await interaction.followup.send("⏳ تم إرسال طلب تأكيد استلام الدفعة المالية للمقرض للتحقق والقبول.")
    except:
        await interaction.followup.send("❌ تعذر إرسال الطلب لأن حساب الخاص للمقرض مغلق.")

# 5. أوامر الإدارة والرقابة
@bot.tree.command(name="الغاء_العامليه", description="إيقاف معاملة سلف جارية بشكل إجباري وقسري وطارئ من الإدارة.")
async def force_cancel(interaction: discord.Interaction, اسم_الشخص: discord.User):
    await interaction.response.defer(ephemeral=True)
    if not await check_admin_permission(interaction): 
        return await interaction.followup.send("❌ عذراً، أنت لا تملك رتب الإدارة المخولة لاستخدام هذا نظام.")
        
    db = load_db()
    to_delete = [lid for lid, loan in db["loans"].items() if loan["borrower_id"] == str(اسم_الشخص.id) or loan["lender_id"] == str(اسم_الشخص.id)]
    
    if to_delete:
        for lid in to_delete:
            del db["loans"][lid]
        save_db(db)
        await interaction.followup.send(f"🚨 تم التدخل الإداري بنجاح وإيقاف السلف المتعلق بالعضو بالكامل.")
    else:
        await interaction.followup.send("❌ لم يتم العثور على أي سلفيات جارية مسجلة تحت اسم هذا الحساب.")

@bot.tree.command(name="اشتكشاف", description="الاستعلام الفوري عن حالة حساب وتصنيفه بالسيرفر (طبيعي / محروم).")
async def investigate(interaction: discord.Interaction, اسم_الشخص: discord.User):
    await interaction.response.defer()
    if not await check_admin_permission(interaction): 
        return await interaction.followup.send("❌ عذراً، هذا الأمر مخصص للإدارة والدعم الفني فقط.")
    db = load_db()
    status = get_user_status(اسم_الشخص.id, db)
    await interaction.followup.send(f"🔍 **تقرير الاستكشاف المالي:**\n👤 الحساب: {اسم_الشخص.mention}\n📊 التصنيف الحالي: **{status}**")

@bot.tree.command(name="محروم", description="إدراج حساب يدوياً بقائمة الحرمان وحظر تعاملاته الماليّة.")
async def ban_user(interaction: discord.Interaction, اسم_الشخص: discord.User):
    await interaction.response.defer()
    if not await check_admin_permission(interaction): 
        return await interaction.followup.send("❌ هذا الأمر مخصص للإدارة والدعم الفني فقط.")
    db = load_db()
    if str(اسم_الشخص.id) not in db["users"]: db["users"][str(اسم_الشخص.id)] = {}
    db["users"][str(اسم_الشخص.id)]["status"] = "محروم"
    save_db(db)
    await interaction.followup.send(f"⛔ تم حظر وتغيير حالة {اسم_الشخص.mention} إلى **محروم من التسلوف** بنجاح.")

@bot.tree.command(name="الغاء_محروم", description="فك الحظر المالي عن حساب وإعادته إلى تصنيف الحساب الطبيعي.")
async def unban_user(interaction: discord.Interaction, اسم_الشخص: discord.User):
    await interaction.response.defer()
    if not await check_admin_permission(interaction): 
        return await interaction.followup.send("❌ هذا الأمر مخصص للإدارة والدعم الفني فقط.")
    db = load_db()
    if str(اسم_الشخص.id) in db["users"]:
        db["users"][str(اسم_الشخص.id)]["status"] = "طبيعي"
        save_db(db)
    await interaction.followup.send(f"🟢 تم إلغاء حرمان {اسم_الشخص.mention} بنجاح وإعادته إلى التصنيف الطبيعي.")
    try: await اسم_الشخص.send("🟢 أهلاً بك، لقد تم رفع الحرمان المالي عن حسابك مجدداً من قبل الإدارة.")
    except: pass

# ─── فحص الأقساط التلقائي كل ساعة ───
@tasks.loop(hours=1)
async def clean_expired_loans():
    db = load_db()
    now = datetime.datetime.now()
    changed = False
    to_delete = []

    for lid, loan in db["loans"].items():
        try:
            expire_dt = datetime.datetime.strptime(loan["expire_at"], "%Y-%m-%d %H:%M:%S")
            if now > expire_dt:
                borrower_id = loan["borrower_id"]
                if borrower_id not in db["users"]: db["users"][borrower_id] = {}
                db["users"][borrower_id]["status"] = "محروم"
                to_delete.append(lid)
                changed = True
                
                try:
                    chan = bot.get_channel(LOG_ROOM_EXPIRED)
                    if chan:
                        await chan.send(
                            f"🚨🚨 **إشعار منشن للإدارة العليا** <@&{ADMIN_ROLE_ID}>\n"
                            f"⚠️ تخلف شخص عن دفع السلف في موعده المحدد (30 يوماً)!\n"
                            f"👤 **المستلف المتهرب:** <@{borrower_id}>\n"
                            f"💰 **المبلغ:** {loan['amount']:,} كريدت\n"
                            f" Link: الحساب تلقى عقوبة **محروم** وتجميد فوري."
                        )
                except: pass
        except: pass

    for lid in to_delete:
        del db["loans"][lid]
    if changed:
        save_db(db)

bot.run(BOT_TOKEN)
