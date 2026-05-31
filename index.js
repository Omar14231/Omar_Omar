const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes, 
    ApplicationCommandOptionType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// إعداد البوت والـ Intents المتوافقة تماماً مع كودك
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DB_FILE = path.join(__dirname, 'bank_data.json');
const SUPPORT_GUILD_ID = "1510395297279508620";  
const ADMIN_USER_ID = "1306034100544737461";
const ADMIN_ROLE_ID = "1510396218482757744";
const LOG_ROOM_EXPIRED = "1510397908653047848";
const LOG_ROOM_SUCCESS = "1510398868510998708";
const BOT_TOKEN = "MTQ2MTkwMDg4Mzg3MTY2MjIwNA.GyVk_t.vvZ68CRKhS2iCj3SuQkzumK6lxUmrp33UPWZBo"; // ضع توكن البوت الخاص بك هنا

// ─── دالات التعامل مع قاعدة البيانات JSON ───
function loadDb() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return { users: {}, loans: {} };
        }
    }
    return { users: {}, loans: {} };
}

function saveDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 4), 'utf8');
}

function getUserStatus(userId, db) {
    return db.users[userId] && db.users[userId].status ? db.users[userId].status : "طبيعي";
}

async function checkAdminPermission(interaction) {
    if (interaction.user.id === ADMIN_USER_ID) return true;
    try {
        const supportGuild = await client.guilds.fetch(SUPPORT_GUILD_ID);
        if (!supportGuild) return false;
        const member = await supportGuild.members.fetch(interaction.user.id);
        if (member && member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    } catch (e) {
        return false;
    }
    return false;
}

// دالة لتنسيق الأرقام بفاصلة (مثل البايثون)
const formatNumber = (num) => Number(num).toLocaleString();

// دالة تنسيق الوقت لـ MySQL / JSON format
function getFutureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

// ─── تسجيل الأوامر (Slash Commands) عند تشغيل البوت ───
const commands = [
    {
        name: 'help',
        description: 'عرض دليل استخدام نظام السلف (مخفي للآخرين).'
    },
    {
        name: 'salafni',
        description: 'تقديم طلب سلف من شخص محدد مع ذكر السبب والمبلغ.',
        options: [
            { name: 'المبلغ', type: ApplicationCommandOptionType.Integer, description: 'كمية الكريدت المطلوبة', required: true },
            { name: 'الشخص', type: ApplicationCommandOptionType.User, description: 'الشخص المراد الاستدانة منه', required: true },
            { name: 'السبب', type: ApplicationCommandOptionType.String, description: 'سبب طلب السلف', required: true }
        ]
    },
    {
        name: 'إلغاء_السلف',
        description: 'إلغاء معاملة سلف جارية بالتراضي بين الطرفين.',
        options: [
            { name: 'الشخص', type: ApplicationCommandOptionType.User, description: 'الشخص المعني بالمعاملة', required: true }
        ]
    },
    {
        name: 'الدفع',
        description: 'تسديد مستحقات مالية وإيقاف نظام السلف.',
        options: [
            { name: 'الشخص', type: ApplicationCommandOptionType.User, description: 'المقرض الذي تريد السداد له', required: true }
        ]
    },
    {
        name: 'الغاء_العامليه',
        description: 'إيقاف معاملة سلف جارية بشكل إجباري وقسري وطارئ من الإدارة.',
        options: [
            { name: 'اسم_الشخص', type: ApplicationCommandOptionType.User, description: 'الحساب المراد فحص قروضه وإلغائها بقوة الإدارة', required: true }
        ]
    },
    {
        name: 'اشتكشاف',
        description: 'الاستعلام الفوري عن حالة حساب وتصنيفه بالسيرفر (طبيعي / محروم).',
        options: [
            { name: 'اسم_الشخص', type: ApplicationCommandOptionType.User, description: 'العضو المراد الاستكشاف عنه', required: true }
        ]
    },
    {
        name: 'محروم',
        description: 'إدراج حساب يدوياً بقائمة الحرمان وحظر تعاملاته الماليّة.',
        options: [
            { name: 'اسم_الشخص', type: ApplicationCommandOptionType.User, description: 'العضو المراد حظره ماليًا', required: true }
        ]
    },
    {
        name: 'الغاء_محروم',
        description: 'فك الحظر المالي عن حساب وإعادته إلى تصنيف الحساب الطبيعي.',
        options: [
            { name: 'اسم_الشخص', type: ApplicationCommandOptionType.User, description: 'العضو المراد فك الحظر عنه', required: true }
        ]
    }
];

client.once('ready', async () => {
    console.log("========================================");
    console.log(`🏦 تم تشغيل نظام السلف المركزي بنجاح (JS)!`);
    console.log(`🤖 الحساب المعرف: ${client.user.username}`);
    console.log("========================================");

    // تسجيل الأوامر عالمياً لجميع السيرفرات
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
        console.error('حدث خطأ أثناء رفع الأوامر:', error);
    }

    // تشغيل فحص القروض التلقائي كل ساعة
    setInterval(cleanExpiredLoans, 60 * 60 * 1000);
    cleanExpiredLoans(); // تشغيل فحص فوري عند الإقلاع
});

// ─── معالجة التفاعل مع الأوامر والأزرار ───
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const db = loadDb();

        // 1. أمر المساعدة
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('🏦 نظام السلف والائتمان المركزي')
                .setDescription('أهلاً بك في نظام الضمان المالي المتقدم.\n\n💡 **إذا كنت ترغب بطلب سلف أو استدانة كريدات من شخص آخر، يرجى استخدام الأمر التالي:**\n👉 `/salafni`')
                .setColor(0x0099FF);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 2. أمر تقديم السلف (salafni)
        if (commandName === 'salafni') {
            const amount = interaction.options.getInteger('المبلغ');
            const targetUser = interaction.options.getUser('الشخص');
            const reason = interaction.options.getString('السبب');

            if (getUserStatus(interaction.user.id, db) === "محروم") {
                return interaction.reply({ content: "❌ عذراً، أنت مدرج في القائمة السوداء ومحروم من التسلف حالياً.", ephemeral: true });
            }
            if (getUserStatus(targetUser.id, db) === "محروم") {
                return interaction.reply({ content: "❌ هذا الشخص محروم من التعاملات المالية حالياً.", ephemeral: true });
            }
            if (targetUser.id === interaction.user.id) {
                return interaction.reply({ content: "❌ لا يمكنك طلب سلف من نفسك!", ephemeral: true });
            }

            await interaction.reply({ content: `⏳ **جاري إرسال طلب السلف إلى ${targetUser} في الخاص...** يرجى انتظاره ليقوم بالقبول أو الرفض.`, ephemeral: true });

            const lenderEmbed = new EmbedBuilder()
                .setTitle('📩 طلب سلف مالي جديد وارد إليك')
                .setDescription(`أهلاً بك، هناك عضو يطلب منك سلفاً مالياً (كريدت). هل توافق على إقراضه؟\n\n👤 **اسم مقدم الطلب:** ${interaction.user.username} (${interaction.user})\n💰 **المبلغ المراد استدانته:** ${formatNumber(amount)} كريدت\n📝 **السبب المذكور:** ${reason}`)
                .setColor(0xFFD700);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_loan_${interaction.user.id}_${amount}_${Date.now()}`).setLabel('نعم، أوافق على إقراضه').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`decline_loan_${interaction.user.id}`).setLabel('رفض الطلب').setStyle(ButtonStyle.Danger)
            );

            try {
                await targetUser.send({ embeds: [lenderEmbed], components: [row] });
            } catch (e) {
                await interaction.followUp({ content: `❌ تعذر إرسال الرسالة إلى ${targetUser} لأن حساب الخاص لديه مغلق!`, ephemeral: true });
            }
        }

        // 3. أمر إلغاء السلف
        if (commandName === 'إلغاء_السلف') {
            const targetUser = interaction.options.getUser('الشخص');
            let loanId = null;

            for (const lid in db.loans) {
                const loan = db.loans[lid];
                if ((loan.borrower_id === interaction.user.id && loan.lender_id === targetUser.id) ||
                    (loan.borrower_id === targetUser.id && loan.lender_id === interaction.user.id)) {
                    loanId = lid;
                    break;
                }
            }

            if (!loanId) {
                return interaction.reply({ content: "❌ لا توجد معاملة سلف جارية وقائمة بينك وبين هذا الشخص حالياً.", ephemeral: true });
            }

            if (db.loans[loanId].lender_id === interaction.user.id) {
                delete db.loans[loanId];
                saveDb(db);
                await interaction.reply({ content: "✅ تم إلغاء السلف المالي بينكما وإسقاطه فوراً ومباشرة من طرف المقرِض." });
                try { await targetUser.send(`⚠️ أحببنا إشعارك بأن ${interaction.user} قام بإلغاء وإسقاط السلف المالي القائم بينكما رسمياً.`); } catch(e){}
                return;
            }

            await interaction.reply({ content: "⏳ تم إرسال طلب إلغاء السلف إلى الطرف الآخر للموافقة والتأكيد." });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cancel_yes_${loanId}_${interaction.user.id}`).setLabel('موافقة على الإلغاء').setStyle(ButtonStyle.Success)
            );
            try { await targetUser.send({ content: `❓ يطلب ${interaction.user} إلغاء السلف القائم والمشترك بينكما، هل توافق؟`, components: [row] }); } catch(e){}
        }

        // 4. أمر الدفع والتسديد
        if (commandName === 'الدفع') {
            const targetUser = interaction.options.getUser('الشخص');
            let loanId = null;

            for (const lid in db.loans) {
                const loan = db.loans[lid];
                if (loan.borrower_id === interaction.user.id && loan.lender_id === targetUser.id) {
                    loanId = lid;
                    break;
                }
            }

            if (!loanId) {
                return interaction.reply({ content: "❌ لا يوجد سلف مسجل عليك لهذا الشخص لتدفعه.", ephemeral: true });
            }

            await interaction.reply({ content: "⏳ تم إرسال طلب تأكيد استلام الدفعة المالية للمقرض للتحقق والقبول." });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pay_yes_${loanId}_${interaction.user.id}`).setLabel('نعم، استلمت أموالي بالكامل').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pay_no_${interaction.user.id}`).setLabel('لا، لم أستلم شيء').setStyle(ButtonStyle.Danger)
            );
            try { await targetUser.send({ content: `🔔 يدّعي ${interaction.user} أنه قام بسداد كامل الدين المستحق لك، هل تؤكد استلام الكريدات؟`, components: [row] }); } catch(e){}
        }

        // 5. أوامر الرقابة والإدارة
        if (commandName === 'الغاء_العامليه') {
            if (!await checkAdminPermission(interaction)) return interaction.reply({ content: "❌ عذراً، أنت لا تملك رتب الإدارة في سيرفر الدعم المخولة لاستخدام هذا النظام.", ephemeral: true });
            const targetUser = interaction.options.getUser('اسم_الشخص');
            let found = false;

            for (const lid in db.loans) {
                const loan = db.loans[lid];
                if (loan.borrower_id === targetUser.id || loan.lender_id === targetUser.id) {
                    try {
                        const bUser = await client.users.fetch(loan.borrower_id);
                        await bUser.send(`⚠️ نود إشعاركم بأنه تم إيقاف السلف المالي القائم بينكما بشكل كامل وإجباري بواسطة الإدارة العليا.`);
                    } catch(e){}
                    try {
                        const lUser = await client.users.fetch(loan.lender_id);
                        await lUser.send(`⚠️ نود إشعاركم بأنه تم إيقاف السلف المالي القائم بينكما بشكل كامل وإجباري بواسطة الإدارة العليا.`);
                    } catch(e){}
                    delete db.loans[lid];
                    found = true;
                }
            }
            if (found) {
                saveDb(db);
                await interaction.reply({ content: `🚨 تم التدخل الإداري بنجاح وإيقاف السلف المتعلق بالعضو ${targetUser.username} بالكامل.` });
            } else {
                await interaction.reply({ content: "❌ لم يتم العثور على أي سلفيات جارية مسجلة تحت اسم هذا الحساب.", ephemeral: true });
            }
        }

        if (commandName === 'اشتكشاف') {
            if (!await checkAdminPermission(interaction)) return interaction.reply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة والدعم الفني فقط.", ephemeral: true });
            const targetUser = interaction.options.getUser('اسم_الشخص');
            const status = getUserStatus(targetUser.id, db);
            await interaction.reply({ content: `🔍 **تقرير الاستكشاف المالي:**\n👤 الحساب: ${targetUser}\n📊 التصنيف الحالي: **${status}**` });
        }

        if (commandName === 'محروم') {
            if (!await checkAdminPermission(interaction)) return interaction.reply({ content: "❌ هذا الأمر مخصص للإدارة والدعم الفني فقط.", ephemeral: true });
            const targetUser = interaction.options.getUser('اسم_الشخص');
            if (!db.users[targetUser.id]) db.users[targetUser.id] = {};
            db.users[targetUser.id].status = "محروم";
            saveDb(db);
            await interaction.reply({ content: `⛔ تم حظر وتغيير حالة ${targetUser} إلى **محروم من التسلوف** بنجاح.` });
        }

        if (commandName === 'الغاء_محروم') {
            if (!await checkAdminPermission(interaction)) return interaction.reply({ content: "❌ هذا الأمر مخصص للإدارة والدعم الفني فقط.", ephemeral: true });
            const targetUser = interaction.options.getUser('اسم_الشخص');
            if (db.users[targetUser.id]) {
                db.users[targetUser.id].status = "طبيعي";
                saveDb(db);
            }
            await interaction.reply({ content: `🟢 تم إلغاء حرمان ${targetUser} بنجاح وإعادته إلى التصنيف الطبيعي.` });
            try { await targetUser.send("🟢 أهلاً بك، لقد تم رفع الحرمان المالي عن حسابك مجدداً من قبل الإدارة، يرجى عدم تكرار المشاكل السابقة منعاً للعقوبات."); } catch(e){}
        }
    }

    // ─── معالجة الضغط على الأزرار (Buttons Handler) ───
    if (interaction.isButton()) {
        const db = loadDb();
        const customId = interaction.customId;

        // قبول طلب سلف
        if (customId.startsWith('accept_loan_')) {
            const parts = customId.split('_');
            const borrowerId = parts[2];
            const amount = parseInt(parts[3]);
            const loanId = `${borrowerId}-${interaction.user.id}-${Math.floor(Date.now() / 1000)}`;
            const expireDate = getFutureDate(30);

            db.loans[loanId] = {
                borrower_id: borrowerId,
                lender_id: interaction.user.id,
                amount: amount,
                reason: "تم القبول عبر الخاص",
                expire_at: expireDate
            };
            saveDb(db);

            await interaction.update({ content: `✅ **قمت بقبول الطلب بنجاح. الطرف الآخر لديه شهر واحد فقط للتسديد.**\nفي حال واجهتك أي مشكلة أو رغبت بتقديم بلاغ يرجى التوجه لسيرفر الدعم:\n[اضغط هنا للتحدث للدعم](https://discord.gg/nQyHR8T3xs)`, components: [] });
            
            try {
                const bUser = await client.users.fetch(borrowerId);
                await bUser.send(`🎉 تم قبول طلب السلف الخاص بك من قِبل ${interaction.user}. المبلغ: ${formatNumber(amount)} كريدت. الموعد النهائي للسداد هو خلال 30 يوماً من الآن.`);
            } catch(e){}

            try {
                const logChan = await client.channels.fetch(LOG_ROOM_SUCCESS);
                if (logChan) await logChan.send(`🤝 **عملية ناجحة:** تمت عملية استسلاف بين <@${borrowerId}> (طالب) و ${interaction.user} (مقرض) بمبلغ ${formatNumber(amount)} كريدت.`);
            } catch(e){}
        }

        // رفض طلب سلف
        if (customId.startsWith('decline_loan_')) {
            const borrowerId = customId.split('_')[2];
            await interaction.update({ content: "❌ لقد قمت برفض هذا السلف المالي.", components: [] });
            try {
                const bUser = await client.users.fetch(borrowerId);
                await bUser.send(`❌ نعتذر منك، لقد تم رفض طلب السلف المقدم إلى ${interaction.user.username}.`);
            } catch(e){}
        }

        // تأكيد إلغاء السلف من المقرض
        if (customId.startsWith('cancel_yes_')) {
            const parts = customId.split('_');
            const loanId = parts[2] + "_" + parts[3] + "_" + parts[4]; // استرجاع المعرف بالكامل
            const borrowerId = parts[5];

            if (db.loans[loanId]) {
                delete db.loans[loanId];
                saveDb(db);
                await interaction.update({ content: "✅ تم تأكيد موافقتك وإلغاء السلف بالكامل بين الطرفين.", components: [] });
                try {
                    const bUser = await client.users.fetch(borrowerId);
                    await bUser.send(`✅ وافق ${interaction.user} على إلغاء السلف، وأغلقت القضية.`);
                } catch(e){}
            } else {
                await interaction.update({ content: "❌ عذراً، لم يتم العثور على هذه المعاملة أو تم تسويتها مسبقاً.", components: [] });
            }
        }

        // المقرض يؤكد استلام الأموال
        if (customId.startsWith('pay_yes_')) {
            const parts = customId.split('_');
            const loanId = parts[2] + "_" + parts[3] + "_" + parts[4];
            const borrowerId = parts[5];

            if (db.loans[loanId]) {
                delete db.loans[loanId];
                saveDb(db);
                await interaction.update({ content: "✅ تم تأكيد الاستلام المالي وأغلق السلف بنجاح.", components: [] });
                try {
                    const bUser = await client.users.fetch(borrowerId);
                    await bUser.send("🎉 تم إغلاق وتأكيد سداد السلف الخاص بك بنجاح، شكراً لالتزامك!");
                } catch(e){}
            } else {
                await interaction.update({ content: "❌ عذراً، المعاملة لم تعد موجودة.", components: [] });
            }
        }

        // المقرض يرفض التأكيد (لم يستلم شيء)
        if (customId.startsWith('pay_no_')) {
            const borrowerId = customId.split('_')[2];
            await interaction.update({ content: "❌ تم رفض التأكيد. إذا كان العضو يدّعي الكذب، يرجى تقديم بلاغ فوراً لجهة الدعم الفني.", components: [] });
            try {
                const bUser = await client.users.fetch(borrowerId);
                await bUser.send("❌ أفاد المقرض بأنه لم يستلم الكريدات. إذا واجهت مشكلة يرجى التوجه لمركز الدعم المالي.");
            } catch(e){}
        }
    }
});

// ─── 6. فحص الأقساط التلقائي (30 يوم) ───
async function cleanExpiredLoans() {
    const db = loadDb();
    const now = new Date();
    let changed = false;

    for (const lid in db.loans) {
        const loan = db.loans[lid];
        // تحويل نص التاريخ المحفوظ إلى مصفوفة وقت صالحة للمقارنة
        const expireDt = new Date(loan.expire_at.replace(' ', 'T'));
        
        if (now > expireDt) {
            const borrowerId = loan.borrower_id;
            if (!db.users[borrowerId]) db.users[borrowerId] = {};
            db.users[borrowerId].status = "محروم";
            delete db.loans[lid];
            changed = true;

            try {
                const logChan = await client.channels.fetch(LOG_ROOM_EXPIRED);
                if (logChan) {
                    await logChan.send(
                        `🚨🚨 **إشعار منشن للإدارة العليا** <@&${ADMIN_ROLE_ID}>\n` +
                        `⚠️ تخلف شخص عن دفع السلف في موعده المحدد (30 يوماً)!\n` +
                        `👤 **المستلف المتهرب:** <@${borrowerId}> (ID: \`${borrowerId}\`)\n` +
                        `💰 **المبلغ Mترتب عليه:** ${formatNumber(loan.amount)} كريدت\n` +
                        `🔗 **رابط التحقق:** الحساب تلقى عقوبة **محروم** وتجميد فوري في السيرفر.`
                    );
                }
            } catch (e) {}
        }
    }
    if (changed) saveDb(db);
}

client.login(BOT_TOKEN);

