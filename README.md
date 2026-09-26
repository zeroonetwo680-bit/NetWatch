# NetWatch — مراقبة الشبكة

منصة عربية (RTL) كاملة لإدارة ومراقبة شبكة محلية: اكتشاف الأجهزة، السرعات اللحظية،
حدود السرعة المطبَّقة فعليًا على الراوتر، وتقارير الاستهلاك اليومية والشهرية.

مبنية على مشروع **Next.js واحد** (App Router) مع SQLite + Drizzle ORM، وطبقة شبكة
قابلة للتبديل بين **راوتر MikroTik حقيقي** و**شبكة محاكاة** بدون أي جهاز.

```txt
UI (React + TanStack Query)
   ↓
/api/* Route Handlers  (جلسة + تحقق Zod)
   ↓
Services  (أجهزة، استهلاك، حدود، مستخدمون)
   ↓                     ↓
Drizzle ORM          NetworkAdapter  (simulated ←→ mikrotik)
   ↓                     ↓
SQLite               RouterOS API → Queues/Firewall → الأجهزة
   ↑
Background Poller: counters → traffic_samples → usage_daily / usage_monthly → تنظيف
```

## المميزات

- **لوحة تحكم لحظية**: عدد الأجهزة المتصلة، التنزيل/الرفع الآن، استهلاك اليوم والشهر،
  رسم بياني لآخر 30 دقيقة (تحديث كل 5 ثوانٍ).
- **الأجهزة**: بحث مؤجَّل (debounce) + تصفية بالحالة + ترتيب + صفحات، إعادة تسمية،
  إسناد إلى مستخدم، حظر/إلغاء حظر، حذف، و**اكتشاف الأجهزة** بضغطة زر.
- **صفحة جهاز** بثلاث تبويبات: نظرة عامة (رسم لحظي + بطاقات)، السرعة (حد التنزيل/الرفع
  وحالة التطبيق على الراوتر)، الاستهلاك (يومي/شهري + جدول).
- **تقارير الاستهلاك**: نطاق 7/30/90 يوم، يومي/شهري، مقارنة بين الأجهزة، وتصدير CSV.
- **حدود السرعة**: جدول واحد لكل الأجهزة مع تفعيل فوري وحالة «مُطبَّق / بانتظار التطبيق».
- **مستخدمون وصلاحيات**: أدمن يرى كل شيء، والمستخدم يرى أجهزته فقط (محكومة في
  `proxy.ts` وفي كل route handler على حدة).
- **وضع محاكاة** كامل: شبكة افتراضية داخل التطبيق تتصرف كراوتر حقيقي (عدادات متزايدة،
  أجهزة تصبح offline، والحد يقيّد السرعة فعليًا) لتطوير واختبار كل شيء دون راوتر.

## التشغيل السريع

```bash
pnpm install
cp .env.example .env.local     # ثم عدّل SESSION_SECRET و ADMIN_PASSWORD
pnpm dev                       # http://localhost:3000
```

أول تشغيل ينفّذ الترحيلات (migrations) ويهيئ قاعدة البيانات تلقائيًا ويُنشئ:

| المستخدم | كلمة المرور | الدور |
|---|---|---|
| `admin` | `admin123` | مدير (كل الصلاحيات) |
| `user` | `user123` | مستخدم (في وضع المحاكاة فقط) |

> غيّر كلمات المرور فورًا بعد أول تشغيل في أي بيئة حقيقية.

## متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `NETWORK_MODE` | `simulated` | `simulated` شبكة افتراضية — `mikrotik` راوتر حقيقي |
| `MIKROTIK_HOST` | `192.168.88.1` | عنوان الراوتر |
| `MIKROTIK_PORT` | `8728` | منفذ RouterOS API |
| `MIKROTIK_USER` / `MIKROTIK_PASSWORD` | `admin` / (فارغ) | بيانات الدخول للراوتر |
| `POLL_INTERVAL_MS` | `10000` | فترة فحص الأجهزة والعدادات |
| `SAMPLE_RETENTION_DAYS` | `7` | مدة الاحتفاظ بالعينات الخام (التجميعات تبقى) |
| `SIM_DEVICE_COUNT` | `10` | عدد أجهزة الشبكة المحاكاة |
| `DATABASE_PATH` | `./data/netwatch.db` | مسار قاعدة SQLite |
| `SESSION_SECRET` | (غير آمن افتراضيًا) | مفتاح توقيع الجلسة — **غيّره إلزاميًا** |
| `SESSION_TTL_HOURS` | `24` | عمر الجلسة |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | حساب المدير الأول |
| `DEMO_USER_USERNAME` / `DEMO_USER_PASSWORD` | `user` / `user123` | مستخدم تجريبي (محاكاة فقط) |

لا تُسبق أي قيمة بأي سر بـ `NEXT_PUBLIC_`: بيانات الراوتر ومفتاح الجلسة تبقى على الخادم.

## الأوامر

```bash
pnpm dev           # تشغيل التطوير (يستمع على 0.0.0.0)
pnpm build         # بناء الإنتاج
pnpm start         # تشغيل الإنتاج
pnpm lint          # ESLint
pnpm test          # Vitest (39 اختبارًا)
pnpm db:generate   # توليد ترحيلات Drizzle
pnpm db:migrate    # تطبيق الترحيلات
pnpm db:studio     # Drizzle Studio
pnpm db:seed       # تهيئة البيانات الأولية
```

## الاختبارات

| الملف | ما يغطيه |
|---|---|
| `tests/usage-calculator.test.ts` | حساب الفروق (بما فيها إعادة ضبط العدّاد)، مفاتيح اليوم/الشهر، التنسيق |
| `tests/simulator.test.ts` | عقد طبقة الشبكة: MAC فريدة، عدادات متزايدة، الحد يقيّد السرعة، الحظر |
| `tests/auth.test.ts` | bcrypt، JWT (صلاحية/انتهاء/تزوير)، مصفوفة صلاحيات الأجهزة |
| `tests/db-services.test.ts` | ترحيلات، البذر مرة واحدة، upsert بالـ MAC، تجميع الاستهلاك، التنظيف، حذف المستخدم لا يحذف أجهزته |

## البنية

```txt
src/
├── app/
│   ├── (app)/            # الصفحات المحمية (لوحة التحكم، الأجهزة، …)
│   ├── api/              # Route Handlers (كل المنطق الخلفي)
│   ├── login/            # تسجيل الدخول
├── components/           # UI (layout, dashboard, devices, device, usage, limits, users, settings, ui)
├── db/                   # schema.ts + index.ts (WAL + ترحيل تلقائي) + seed.ts
├── lib/
│   ├── api/              # contracts + schemas (Zod) + client + modules (keys/hooks)
│   ├── network/          # types + simulator + mikrotik + factory
│   ├── usage/            # calculator (دوال نقية)
│   ├── format.ts         # تنسيق البايتات والسرعات (عربي)
│   └── config.ts         # env → appConfig (مُتحقَّق منه بـ Zod)
├── server/
│   ├── auth.ts           # bcrypt + JWT + صلاحيات
│   ├── http.ts           # ok/fail/handle + ApiProblem عربي
│   └── services/         # devices, usage, speed-limits, users, system, poller
├── instrumentation.ts    # تشغيل الـ poller عند إقلاع الخادم
└── proxy.ts              # Next.js 16 proxy: حماية الجلسة
```

## الانتقال إلى راوتر حقيقي

راجع [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — يشمل متطلبات MikroTik
(تفعيل خدمة API ومستخدم بصلاحيات `read,write,test,api`) وخطوات النشر والنسخ الاحتياطي.

وثيقة المشروع الكاملة (البرومبت المعماري) في [`PROJECT_PROMPT.md`](PROJECT_PROMPT.md).
