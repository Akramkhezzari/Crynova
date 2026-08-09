# ============================================================
# Dockerfile - Crynova Backend
# ============================================================
FROM node:18-alpine

WORKDIR /app

# نسخ ملفات الاعتماديات أولاً للاستفادة من طبقات الكاش في Docker
COPY package*.json ./

RUN npm install --omit=dev

# نسخ باقي ملفات المشروع
COPY . .

# Render يمرر رقم المنفذ عبر متغير البيئة PORT تلقائياً (افتراضي 10000)
# كود server.js يقرأ process.env.PORT بالفعل، فلا حاجة لتثبيت رقم هنا
EXPOSE 10000

CMD ["node", "server.js"]
