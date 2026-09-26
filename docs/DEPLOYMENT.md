# نشر NetWatch

NetWatch تطبيق Next.js واحد: الواجهة والـ API والـ worker كلها في عملية واحدة،
وقاعدة البيانات ملف SQLite واحد. هذا يجعل النشر بسيطًا جدًا — ولا يمنع التوسّع لاحقًا.

---

## 1. متطلبات MikroTik (للتحكم الفعلي)

يُنفَّذ مرة واحدة على الراوتر (WinBox → Terminal أو SSH):

```routeros
# تفعيل خدمة API (أو API-SSL للمنفذ 8729)
/ip service set api disabled=no port=8728

# مستخدم مخصّص بأقل الصلاحيات اللازمة
/user group add name=netwatch policy=read,write,test,api
/user add name=netwatch group=netwatch password="كلمة-مرور-قوية"
```

> **أمان**: قيّد الوصول إلى منفذ API على عنوان السيرفر فقط:
> `/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=<SERVER_IP> action=accept`
> ثم أضف قاعدة `drop` بعدها للمنفذ نفسه.

### ما يفعله NetWatch على الراوتر

| الإجراء | الأمر |
|---|---|
| اكتشاف الأجهزة | `/ip/dhcp-server/lease/print` + `/ip/arp/print` |
| حد السرعة | `/queue/simple` باسم `netwatch-<MAC>` و`max-limit=<رفع>/<تنزيل>` |
| إزالة الحد | حذف الطابور `netwatch-<MAC>` |
| الحظر | `/ip/firewall/filter` قاعدة `drop` بتعليق `netwatch-block-<MAC>` |

> تنبيه: RouterOS لا يوفّر عدّادًا تراكميًا لكل جهاز. يعتمد NetWatch على معدّل
> الطابور (`rate`) عندما يكون متاحًا، وإلا يستنتج الاستهلاك من فروق العدّادات
> (راجع التعليقات داخل `src/lib/network/mikrotik.ts`).

---

## 2. الإعداد على السيرفر

```bash
git clone <repo> netwatch && cd netwatch
pnpm install --frozen-lockfile
cp .env.example .env.local
```

عدّل `.env.local`:

```dotenv
NETWORK_MODE=mikrotik
MIKROTIK_HOST=192.168.88.1
MIKROTIK_PORT=8728
MIKROTIK_USER=netwatch
MIKROTIK_PASSWORD=كلمة-مرور-قوية

SESSION_SECRET=مفتاح-طويل-عشوائي-32-حرفًا-على-الأقل
ADMIN_PASSWORD=كلمة-مرور-قوية-للمدير

DATABASE_PATH=./data/netwatch.db
POLL_INTERVAL_MS=10000
SAMPLE_RETENTION_DAYS=7
```

> في الإنتاج ولّد مفتاحًا عشوائيًا:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 3. البناء والتشغيل

```bash
pnpm build
pnpm start -H 0.0.0.0 -p 3000
```

أو عبر systemd (`/etc/systemd/system/netwatch.service`):

```ini
[Unit]
Description=NetWatch
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/netwatch
EnvironmentFile=/opt/netwatch/.env.local
ExecStart=/usr/bin/pnpm start -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now netwatch
```

يُنصح بـ reverse proxy (Nginx/Caddy) لإنهاء TLS وإعادة التوجيه إلى المنفذ 3000.

---

## 4. قاعدة البيانات والنسخ الاحتياطي

- المسار الافتراضي `./data/netwatch.db` (مستثنى من Git).
- الجداول: `users`، `devices`، `speed_limits`، `traffic_samples` (مؤقت)،
  `usage_daily`، `usage_monthly`، `settings`.
- النسخ الاحتياطي = نسخ الملف (يفضَّل مع `-wal`/`-shm` أو بعد `VACUUM INTO`):

```bash
sqlite3 data/netwatch.db "VACUUM INTO '/backup/netwatch-$(date +%F).db'"
```

أو عبر cron يومي:

```cron
0 3 * * * cd /opt/netwatch && sqlite3 data/netwatch.db "VACUUM INTO '/backup/netwatch-'$(date +\%F)'.db'"
```

- العينات الخام (`traffic_samples`) تُمحص تلقائيًا بعد `SAMPLE_RETENTION_DAYS`،
  أما التجميع اليومي والشهري فيبقى دائمًا.

---

## 5. التشخيص

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| الشريط يعرض «الراوتر غير متصل» | خدمة API معطّلة أو بيانات خاطئة | `/ip service print`، وراجع `/settings → اختبار الاتصال` |
| الأجهزة لا تظهر | لا توجد عقود DHCP نشطة | تأكد من `/ip dhcp-server lease print` |
| الحد لا يُطبَّق | صلاحيات المستخدم لا تشمل `write` | أضف السياسة `write` لمستخدم netwatch |
| الاستهلاك لا يزيد | فترة الفحص طويلة أو الأجهزة offline | قلّل `POLL_INTERVAL_MS`، وراجع «آخر فحص» في الإعدادات |
| قاعدة البيانات مقفولة | تشغيل أكثر من عملية على نفس الملف | شغّل نسخة واحدة فقط من التطبيق |

---

## 6. الأمان

- الجلسة: JWT موقّع (HS256) في كوكي `httpOnly` + `sameSite=lax` (+ `secure` في الإنتاج).
- كلمات المرور: bcrypt (cost 10)، ولا تُعاد أبدًا في أي استجابة.
- كلمة مرور الراوتر: تُكتب فقط ولا تُخزَّن في قاعدة البيانات ولا تظهر في أي API.
- لا تُعرض أي قيمة حساسة عبر متغيرات `NEXT_PUBLIC_*`.
- الصلاحيات محكومة مرتين: في `src/proxy.ts` وفي كل route handler.
