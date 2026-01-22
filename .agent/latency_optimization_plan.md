# План оптимизации задержки (Latency) в Voice-канале

## Проблема
Общая задержка между репликой пользователя и ответом бота составляет **9 секунд**, что неприемлемо для голосового взаимодействия.

## Целевые показатели
- **Первый звук (First Byte)**: < 500ms
- **Полный ответ**: < 2-3 секунды

---

## Решение 1: Streaming Response от Gemini + Streaming TTS от Twilio

### Архитектура
```
Пользователь → Twilio (STT) → WebSocket → Наш сервер
                                              ↓
                                    Gemini Streaming API
                                              ↓
                                    Первые 2-3 слова
                                              ↓
                                    Twilio TTS (начинает говорить)
                                              ↓
                                    Продолжение генерации
```

### Технические компоненты

#### 1. Gemini Streaming API
**Текущий код:**
```javascript
const result = await model.generateContent({ contents: contentsForGemini });
const text = result.response.text(); // Ждем весь ответ
```

**Новый код (Streaming):**
```javascript
const result = await model.generateContentStream({ contents: contentsForGemini });
let fullText = '';
let firstChunkSent = false;

for await (const chunk of result.stream) {
  const chunkText = chunk.text();
  fullText += chunkText;
  
  // Как только получили 2-3 слова - отправляем в TTS
  if (!firstChunkSent && fullText.split(' ').length >= 3) {
    firstChunkSent = true;
    // Отправить первый кусок в Twilio через WebSocket
    sendToTwilioTTS(fullText);
  }
}
```

#### 2. Twilio Media Streams (WebSocket)
**Что нужно:**
- Создать WebSocket сервер для приема/отправки аудио
- Использовать `<Connect><Stream>` вместо `<Say>` для двунаправленной связи
- Отправлять текст в Twilio TTS по мере генерации

**Новый эндпоинт:**
```javascript
// WebSocket сервер для Media Streams
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    if (data.event === 'media') {
      // Получаем аудио от пользователя (STT уже сделан Twilio)
    }
    
    if (data.event === 'start') {
      // Начало стрима
      const callSid = data.start.callSid;
      // Запускаем Gemini streaming
      streamGeminiResponse(callSid, ws);
    }
  });
});
```

---

## Решение 2: Instant Placeholder (Фраза-заглушка)

### Концепция
Пока Gemini "прогревается", **мгновенно** проигрываем заранее записанную фразу.

### Реализация

#### Вариант A: Pre-recorded MP3
```javascript
app.post('/respond', async (request, response) => {
  const speechResult = request.body.SpeechResult;
  const callSid = request.body.CallSid;
  
  const twiml = new VoiceResponse();
  
  // МГНОВЕННАЯ фраза (0ms задержка)
  twiml.play('https://api.leadertechnology.shop/music/checking.mp3'); // "רק רגע, אני בודקת"
  
  // Пока играет музыка (1-2 сек) - запускаем Gemini в фоне
  const aiTask = conversationEngine.processMessage(...);
  pendingAITasks.set(callSid, aiTask);
  
  // Редирект на проверку готовности
  twiml.redirect('/check_ai?CallSid=' + callSid);
  
  response.type('text/xml');
  response.send(twiml.toString());
});
```

#### Вариант B: TTS с кешированием
Twilio кеширует TTS для одинаковых фраз:
```javascript
twiml.say({ voice: 'Polly.Hila' }, 'רק רגע, אני בודקת');
```

---

## Решение 3: Параллелизация (уже реализовано ✅)

**Уже работает:**
```javascript
const [context, customerData] = await Promise.all([
  getContextForPrompt(userMessage, 3),
  crmService.getCustomerData(userPhone)
]);
```

---

## Рекомендуемый план внедрения

### Фаза 1: Quick Win (1-2 часа) ⚡
**Цель:** Снизить задержку до 3-4 секунд

1. ✅ Добавить логирование времени (уже сделано)
2. 🔧 Добавить instant placeholder:
   - Записать MP3 с фразой "רק רגע, אני בודקת"
   - Проигрывать её **сразу** после получения вопроса
   - Пока играет (1.5 сек) - Gemini обрабатывает запрос

**Ожидаемый результат:** 
- First Byte: 100-200ms (проигрывание MP3)
- Total: 3-4 секунды

---

### Фаза 2: Streaming (4-6 часов) 🚀
**Цель:** Снизить задержку до 1-2 секунд

1. 🔧 Реализовать Gemini Streaming:
   - Использовать `generateContentStream()`
   - Отправлять первые 2-3 слова сразу

2. 🔧 Интегрировать Twilio Media Streams:
   - Создать WebSocket сервер
   - Использовать `<Connect><Stream>` вместо `<Say>`
   - Отправлять текст в TTS по мере генерации

**Ожидаемый результат:**
- First Byte: 300-500ms (первые слова от Gemini)
- Total: 1.5-2 секунды

---

## Метрики для мониторинга

```javascript
console.log(`⏱️ STT → Gemini Start: ${sttToGeminiMs}ms`);
console.log(`⏱️ Gemini First Token: ${firstTokenMs}ms`);
console.log(`⏱️ Gemini Full Response: ${fullResponseMs}ms`);
console.log(`⏱️ TTS Start: ${ttsStartMs}ms`);
console.log(`⏱️ Total Latency: ${totalMs}ms`);
```

---

## Следующие шаги

**Что делаем сейчас?**
1. Фаза 1 (Quick Win) - добавить placeholder?
2. Фаза 2 (Streaming) - полная реализация?
3. Сначала протестировать текущую задержку с новыми логами?
