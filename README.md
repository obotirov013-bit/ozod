# SkillOrbit

Образовательная P2P-платформа: ученики помогают друг другу готовиться к IELTS, SAT, CSCA
и учиться программированию. Лендинг с waitlist, интерактивной солнечной системой навыков
и демо P2P-комнаты на WebRTC.

## Архитектура

```
 Браузер A ──────── WebRTC (RTCDataChannel, шифрование DTLS) ──────── Браузер B
     │                          напрямую, peer-to-peer                    │
     └──── WebSocket /ws/signal ───► Spring Boot ◄─── WebSocket /ws/signal ┘
                                   │  • сигнальный сервер (SDP/ICE)
           REST /api/waitlist ───► │  • waitlist (JPA + H2/PostgreSQL)
                                   │  • раздаёт frontend/
```

Сервер только «знакомит» учеников (сигналинг) и хранит waitlist. Сами занятия — сообщения,
а в будущем звук и видео — идут напрямую между браузерами.

## Структура проекта

```
skillorbit/
├── README.md
├── .gitignore
├── frontend/                         HTML5 + CSS3 + JavaScript (ES-модули, без сборки)
│   ├── index.html                    лендинг: hero, 4 планеты, «как это работает», waitlist
│   ├── room.html                     демо P2P-комнаты (чат через RTCDataChannel)
│   ├── assets/favicon.svg
│   ├── css/
│   │   ├── styles.css                токены палитры, раскладка, бургер, toast, адаптив
│   │   └── room.css                  стили P2P-комнаты
│   └── js/
│       ├── main.js                   точка входа лендинга
│       ├── config.js                 адрес API и сигнального сервера
│       ├── api.js                    REST-клиент + очередь неотправленных заявок
│       ├── room.js                   логика страницы комнаты
│       ├── ui/
│       │   ├── menu.js               анимированное бургер-меню (фокус-ловушка, Esc)
│       │   ├── navigation.js         шапка, активный раздел, фокус по якорям
│       │   ├── toast.js              уведомления
│       │   └── waitlist.js           форма: валидация, мгновенный успех, фоновая отправка
│       ├── p2p/
│       │   └── peer-room.js          WebRTC mesh-комната поверх сигнального сервера
│       └── scene/                    canvas-сцена «солнечная система навыков»
│           ├── solar-system.js       цикл кадра, камера по скроллу, отрисовка, клики
│           ├── scene-config.js       планеты, спутники-ученики, P2P-связи, кадры камеры
│           ├── camera.js             перспективная камера и смешивание кадров
│           ├── sky.js                звёзды и Млечный Путь
│           ├── planet-sprite.js      попиксельное освещение планет, кольца, атмосфера
│           ├── textures.js           процедурные текстуры планет
│           ├── noise.js              3D value noise + fBm
│           └── math.js               математика
└── backend/                          Java 17 + Spring Boot 3.5
    ├── pom.xml
    └── src/
        ├── main/java/com/skillorbit/
        │   ├── SkillOrbitApplication.java
        │   ├── config/
        │   │   ├── SkillOrbitProperties.java   настройки skillorbit.* из application.yml
        │   │   ├── WebConfig.java              CORS для /api/**
        │   │   └── WebSocketConfig.java        регистрация /ws/signal
        │   ├── waitlist/
        │   │   ├── WaitlistController.java     POST /api/waitlist, GET /api/waitlist/count
        │   │   ├── WaitlistService.java        идемпотентная запись, место в очереди
        │   │   ├── WaitlistRepository.java
        │   │   ├── WaitlistEntry.java          JPA-сущность (уникальный email)
        │   │   ├── EmailRules.java             общая проверка email, маскирование для логов
        │   │   ├── JoinStatus.java
        │   │   └── dto/                        JoinWaitlistRequest/Response, WaitlistCountResponse
        │   ├── p2p/
        │   │   ├── SignalingHandler.java       сигнальный WebSocket для WebRTC
        │   │   ├── PeerRegistry.java           участники по комнатам (в памяти)
        │   │   ├── PeerSession.java
        │   │   └── RoomFullException.java
        │   ├── skill/
        │   │   ├── Skill.java                  IELTS, SAT, CSCA, Programming
        │   │   └── SkillController.java        GET /api/skills (+ сколько учеников онлайн)
        │   └── common/
        │       ├── GlobalExceptionHandler.java понятные ошибки 400/429
        │       ├── ApiError.java
        │       ├── RateLimiter.java            10 записей в минуту с одного IP
        │       └── RateLimitExceededException.java
        ├── main/resources/application.yml
        └── test/java/com/skillorbit/
            ├── waitlist/WaitlistControllerTest.java
            └── p2p/
                ├── PeerRegistryTest.java
                └── SignalingHandlerTest.java   сквозной тест сигналинга через настоящий WebSocket
```

## Запуск

Нужны **JDK 17+** и **Maven 3.9+** (или IntelliJ IDEA — там Maven встроен).

```bash
cd skillorbit/backend
mvn spring-boot:run
```

Откройте http://localhost:8080 — Spring Boot отдаёт фронтенд из `../frontend`, поэтому
запускайте команду именно из папки `backend`. База H2 создаётся в `backend/data/`.

Тесты:

```bash
mvn test
```

### Только фронтенд

Фронтенд работает и без бэкенда: откройте `frontend/` любым статическим сервером
(например, Live Server в VS Code). Уведомление об успехе всё равно появится сразу, а заявка
сохранится в `localStorage` и уйдёт на сервер, когда он станет доступен.
Если фронтенд открыт с другого порта localhost, запросы автоматически идут на
`http://localhost:8080`. Свой адрес API можно задать в `<meta name="skillorbit-api">`.

## API

| Метод | Путь | Ответ |
|---|---|---|
| `POST` | `/api/waitlist` | `{"email": "ada@example.com", "source": "landing"}` → `201 REGISTERED` или `200 ALREADY_REGISTERED`, `{status, email, position, message}`; `400` — неверный email; `429` — слишком часто |
| `GET` | `/api/waitlist/count` | `{"count": 1204}` |
| `GET` | `/api/skills` | `[{"id": "ielts", "title": "IELTS", "peersOnline": 3}, …]` |
| `WS` | `/ws/signal` | сигналинг WebRTC, протокол описан в `SignalingHandler.java` и `peer-room.js` |
| `GET` | `/actuator/health` | состояние сервиса |

## Как устроена сцена

* Каждая секция страницы помечена `data-shot` (`overview`, `ielts`, `sat`, `csca`,
  `programming`, `network`, `farewell`). При скролле кадры камеры плавно смешиваются,
  а между планетами камера идёт по дуге, приподнимаясь над системой.
* Млечный Путь поворачивается вместе со скроллом, планеты медленно идут по орбитам и вращаются.
* Планеты освещаются попиксельно (Ламберт, мягкий терминатор, атмосфера, блик океана,
  огни на ночной стороне у Programming); текстуры генерируются процедурно по частям,
  не блокируя главный поток.
* Наведение на планету подсвечивает её орбиту, клик ведёт к её разделу.
* При `prefers-reduced-motion: reduce` орбиты и параллакс останавливаются, а смена кадров
  происходит мгновенно.

## Продакшен

* **База:** замените H2 на PostgreSQL — добавьте зависимость `org.postgresql:postgresql`
  и задайте `spring.datasource.*`; вместо `ddl-auto: update` используйте Flyway.
* **Домены:** укажите свой домен в `skillorbit.cors.allowed-origins`.
* **Прокси:** за nginx включите `server.forward-headers-strategy: framework`, чтобы ограничение
  частоты видело реальный IP.
* **WebRTC:** для пользователей за строгим NAT добавьте TURN-сервер (например, coturn) в
  `iceServers` в `frontend/js/p2p/peer-room.js`.
* **Масштабирование:** реестр комнат и ограничение частоты хранятся в памяти одного экземпляра;
  для нескольких экземпляров вынесите их в Redis.
