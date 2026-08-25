"use client";

import React, { useState, useMemo } from "react";
import { Search, X, Shield, Code, Cpu, Layers, Sparkles, Terminal } from "lucide-react";
import { useLocale } from "@/lib/intl/provider";
import { cn } from "@/lib/utils";

interface SkillItem {
  id: string;
  name: string;
  category: "core" | "frontend" | "backend" | "cross";
  categoryLabelEn: string;
  categoryLabelRu: string;
  trigger: string;
  descriptionEn: string;
  descriptionRu: string;
  highlightEn: string;
  highlightRu: string;
  rulesEn: string[];
  rulesRu: string[];
}

const skillsData: SkillItem[] = [
  // Core
  {
    id: "gstack-roles",
    name: "gstack-roles",
    category: "core",
    categoryLabelEn: "Core",
    categoryLabelRu: "Базовый",
    trigger: "Every task / Slash commands",
    descriptionEn: "23 specialist roles (PM, Architect, QA Lead, CSO) — AI declares its role before each phase.",
    descriptionRu: "23 роли специалистов (PM, Architect, QA Lead, CSO) — AI заявляет роль перед каждой фазой.",
    highlightEn: "Role declaration protocol",
    highlightRu: "Протокол декларации ролей",
    rulesEn: ["Declare specialist role at start of each phase", "Never execute BUILD before SPEC & PLAN are approved", "Announce role switch when moving across phases"],
    rulesRu: ["Заявлять роль специалиста в начале каждой фазы", "Никогда не начинать BUILD до утверждения SPEC и PLAN", "Объявлять смену роли при переходе между фазами"],
  },
  {
    id: "engineering-workflow",
    name: "engineering-workflow",
    category: "core",
    categoryLabelEn: "Core",
    categoryLabelRu: "Базовый",
    trigger: "DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP",
    descriptionEn: "Enforces the 6-phase engineering pipeline, quality gates, and slash commands.",
    descriptionRu: "Контролирует 6-фазный инженерный пайплайн, гейты качества и слеш-команды.",
    highlightEn: "Iron law: no code before spec",
    highlightRu: "Закон: ноль кода без спеки",
    rulesEn: ["Phase 1: Product Spec (/spec)", "Phase 2: Architectural Plan (/plan)", "Phase 3: Senior Build (/build)", "Phase 4: QA Verify (/test)", "Phase 5: Staff Review (/review)", "Phase 6: Release (/ship)"],
    rulesRu: ["Фаза 1: Спецификация продукта (/spec)", "Фаза 2: Архитектурный план (/plan)", "Фаза 3: Разработка (/build)", "Фаза 4: QA-верификация (/test)", "Фаза 5: Код-ревью (/review)", "Фаза 6: Релиз (/ship)"],
  },
  {
    id: "ponytail-mindset",
    name: "ponytail-mindset",
    category: "core",
    categoryLabelEn: "Core",
    categoryLabelRu: "Базовый",
    trigger: "Every BUILD phase",
    descriptionEn: "7-rung decision ladder before writing code. Reduces code output by ~54% without cutting safety.",
    descriptionRu: "7-ступенчатая лестница решений. Сокращает объем кода на 54% без потери безопасности.",
    highlightEn: "54% less code output",
    highlightRu: "На 54% меньше кода",
    rulesEn: ["Rung 1: Don't write code (use existing platform/config)", "Rung 2: Use Web Standard / Runtime builtin", "Rung 3: Use existing package in dependencies", "Rung 4: Pure utility function in utils/", "Rung 5: Isolated service / use-case", "Rung 6: Extend type interfaces", "Rung 7: Add external package (only as last resort)"],
    rulesRu: ["Ступень 1: Не писать код (использовать конфиг/платформу)", "Ступень 2: Нативный Web Standard / Runtime API", "Ступень 3: Использовать существующую зависимость", "Ступень 4: Чистая функция в utils/", "Ступень 5: Изолированный сервис/use-case", "Ступень 6: Расширить типы/схему", "Ступень 7: Внешний npm-пакет (в крайнем случае)"],
  },

  // Frontend
  {
    id: "ui-ux-pro",
    name: "ui-ux-pro",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "create component | UI | style",
    descriptionEn: "Planning guide for UI: semantic color palettes, typography scale, Framer Motion, and shadcn patterns.",
    descriptionRu: "Гайд по UI: семантические палитры, модульная типографика, Framer Motion и паттерны shadcn.",
    highlightEn: "Anti-AI slop palettes",
    highlightRu: "Чистые дизайн-системы",
    rulesEn: ["No generic saturated red/blue colors", "Semantic token hierarchy (background, foreground, muted, border)", "Modular typography scale with strict letter-spacing"],
    rulesRu: ["Никаких случайных ярких цветов", "Семантическая иерархия токенов (background, foreground, muted, border)", "Модульная типографика со строгим межбуквенным интервалом"],
  },
  {
    id: "impeccable-design",
    name: "impeccable-design",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "REVIEW phase for UI",
    descriptionEn: "50 deterministic QA rules for design review (typography T1-T10, colors C1-C12, layout L1-L11).",
    descriptionRu: "50 строгих QA-правил аудита дизайна (типографика T1-T10, цвета C1-C12, сетки L1-L11).",
    highlightEn: "50 design QA invariants",
    highlightRu: "50 строгих UI-инвариантов",
    rulesEn: ["T1-T10: Typography rules & hierarchy", "C1-C12: Contrast & color harmony", "L1-L11: Layout stability, z-index containment & scroll physics"],
    rulesRu: ["T1-T10: Правила типографики и иерархии", "C1-C12: Контрастность и цветовая гармония", "L1-L11: Стабильность разметки, изоляция z-index и скролл"],
  },
  {
    id: "react",
    name: "react",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "*.tsx | *.jsx",
    descriptionEn: "React 19, concurrency, state colocation, useOptimistic, zero useEffect for derived state.",
    descriptionRu: "React 19, конкурентный рендеринг, useOptimistic, ноль useEffect для вычисляемого стейта.",
    highlightEn: "React 19 & Optimistic UI",
    highlightRu: "React 19 и Optimistic UI",
    rulesEn: ["No useEffect for computed/derived state", "useOptimistic for instant UI feedback", "State colocated to lowest common ancestor"],
    rulesRu: ["Ноль useEffect для вычисляемого стейта", "useOptimistic для мгновенного отклика интерфейса", "Колокация состояния на минимально необходимом уровне"],
  },
  {
    id: "nextjs",
    name: "nextjs",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "next.config.* | app/",
    descriptionEn: "Next.js App Router, RSC, React.cache() deduplication, Server Actions auth, and bundle optimization.",
    descriptionRu: "Next.js App Router, RSC, дедупликация через React.cache(), Server Actions и оптимизация бандла.",
    highlightEn: "Zero async waterfalls",
    highlightRu: "Ноль асинхронных водопадов",
    rulesEn: ["React.cache() for request deduplication", "Auth validation at start of Server Actions", "Parallel data fetching with Promise.all()"],
    rulesRu: ["Дедупликация запросов через React.cache()", "Проверка авторизации в начале Server Actions", "Параллельная загрузка данных через Promise.all()"],
  },
  {
    id: "typescript",
    name: "typescript",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "tsconfig.json | *.ts",
    descriptionEn: "Strict type safety, generics, config, and invariant assertions without type any.",
    descriptionRu: "Строгая типизация, дженерики, конфигурация компилятора и проверки без типа any.",
    highlightEn: "Strict type contracts",
    highlightRu: "Строгие контракты типов",
    rulesEn: ["No 'any' in production code", "Discriminated unions for multi-state responses", "Strict null checks enabled by default"],
    rulesRu: ["Запрет типа 'any' в продакшен-коде", "Дискриминантные объединения для состояний", "Строгая проверка на null/undefined"],
  },
  {
    id: "web-accessibility",
    name: "web-accessibility",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "modal | dialog | form | aria",
    descriptionEn: "ARIA dialog contracts, keyboard focus traps, WCAG 2.1 AA compliance, and visible focus rings.",
    descriptionRu: "Контракты ARIA-диалогов, ловушки фокуса, стандарт WCAG 2.1 AA и видимый фокус клавиатуры.",
    highlightEn: "WCAG 2.1 AA by default",
    highlightRu: "WCAG 2.1 AA по умолчанию",
    rulesEn: ["Focus trap on all modals with Tab/Shift-Tab wrap", "Escape key closes overlays & restores previous focus", "4.5:1 minimum color contrast ratio"],
    rulesRu: ["Ловушка фокуса во всех модалках (циклический Tab/Shift-Tab)", "Закрытие по Escape и возврат фокуса на триггер", "Минимальный контраст текста 4.5:1"],
  },
  {
    id: "ui-design",
    name: "ui-design",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "components/ui/* | tokens",
    descriptionEn: "Component library design, token architectures, and design consistency guidelines.",
    descriptionRu: "Проектирование библиотек компонентов, архитектура дизайн-токенов и консистентность.",
    highlightEn: "Design token systems",
    highlightRu: "Системы дизайн-токенов",
    rulesEn: ["Atomic design token abstraction", "Predictable prop naming (variant, size, asChild)", "No arbitrary tailwind values in base components"],
    rulesRu: ["Атомарные токены дизайн-системы", "Консистентный API пропсов (variant, size, asChild)", "Никаких произвольных Tailwind-значений в UI"],
  },
  {
    id: "ux-design",
    name: "ux-design",
    category: "frontend",
    categoryLabelEn: "Frontend",
    categoryLabelRu: "Фронтенд",
    trigger: "flow | onboarding | feedback",
    descriptionEn: "User flow design, progressive disclosure, and interaction micro-patterns.",
    descriptionRu: "Проектирование пользовательских путей, прогрессивное раскрытие и микро-паттерны.",
    highlightEn: "Zero-friction flows",
    highlightRu: "Бесшовный пользовательский опыт",
    rulesEn: ["Designed empty states for every list/feed", "Skeleton loaders matching exact final layout", "Clear error boundaries with retry buttons"],
    rulesRu: ["Дизайн пустых состояний для всех списков", "Скелетоны с точной геометрией контента", "Error Boundary с кнопкой повтора"],
  },

  // Backend
  {
    id: "system-design",
    name: "system-design",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "architecture | system | scale",
    descriptionEn: "Pre-design checklist, Serverless/Edge patterns, BFF/Server Actions, and DDD isolation.",
    descriptionRu: "Чеклист проектирования, Serverless/Edge паттерны, BFF/Server Actions и изоляция DDD.",
    highlightEn: "Scalable system blueprints",
    highlightRu: "Масштабируемые архитектуры",
    rulesEn: ["Stateless core services", "Idempotency keys on all mutating operations", "Explicit rate limits and timeouts on upstream dependencies"],
    rulesRu: ["Stateless архитектура сервисов", "Ключи идемпотентности на всех мутациях", "Таймауты и лимиты запросов к внешним API"],
  },
  {
    id: "database",
    name: "database",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "schema.prisma | drizzle | sql",
    descriptionEn: "PostgreSQL schema design, indexing strategies, Prisma/Drizzle ORMs, and N+1 query prevention.",
    descriptionRu: "Схемы PostgreSQL, стратегии индексации, Prisma/Drizzle ORM и устранение N+1 запросов.",
    highlightEn: "N+1 query prevention",
    highlightRu: "Защита от N+1 запросов",
    rulesEn: ["Indexes on all foreign keys and filter fields", "Eager loading or Dataloader for N+1 prevention", "Strict foreign key constraints with ON DELETE rules"],
    rulesRu: ["Индексы на всех внешних ключах и фильтрах", "Eager loading / DataLoader для устранения N+1", "Строгие внешние ключи с правилами ON DELETE"],
  },
  {
    id: "node",
    name: "node",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "server.js | node:*",
    descriptionEn: "Modern Node.js runtime patterns, stream processing, error hierarchies, and performance.",
    descriptionRu: "Паттерны рантайма Node.js, потоковая обработка, иерархия ошибок и производительность.",
    highlightEn: "Non-blocking event loop",
    highlightRu: "Неблокирующий Event Loop",
    rulesEn: ["Streams for files/payloads > 10MB", "Structured error taxonomy inheriting CustomAppError", "Graceful SIGTERM/SIGINT teardown handlers"],
    rulesRu: ["Потоки (Streams) для файлов > 10 МБ", "Иерархия кастомных классов ошибок", "Корректный Graceful Shutdown по SIGTERM"],
  },
  {
    id: "fastapi",
    name: "fastapi",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "main.py | requirements.txt",
    descriptionEn: "FastAPI / Python backends, Pydantic v2 schemas, async endpoints, and OpenAPI contracts.",
    descriptionRu: "FastAPI / Python бэкенды, схемы Pydantic v2, асинхронные эндпоинты и спецификации OpenAPI.",
    highlightEn: "Pydantic v2 schemas",
    highlightRu: "Схемы Pydantic v2",
    rulesEn: ["Async def for IO-bound endpoints", "Pydantic v2 field validators", "Dependency injection for db sessions"],
    rulesRu: ["Async def для операций ввода-вывода", "Валидаторы полей в Pydantic v2", "Внедрение сессий БД через Depends()"],
  },
  {
    id: "nestjs",
    name: "nestjs",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "nest-cli.json | *.module.ts",
    descriptionEn: "NestJS enterprise modular architecture, dependency injection, and guard middleware.",
    descriptionRu: "Модульная архитектура NestJS, внедрение зависимостей (DI) и middleware-гарды.",
    highlightEn: "Enterprise modular DI",
    highlightRu: "Модульный DI уровня Enterprise",
    rulesEn: ["Module boundary encapsulation", "Guards for JWT/RBAC authorization", "Pipes for DTO schema transformation"],
    rulesRu: ["Инкапсуляция границ модулей", "Guards для проверки прав доступа", "Pipes для валидации DTO"],
  },
  {
    id: "microservices",
    name: "microservices",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "kafka | rabbitmq | rpc",
    descriptionEn: "Service decomposition, event-driven messaging, idempotency keys, and circuit breakers.",
    descriptionRu: "Декомпозиция сервисов, событийный обмен сообщениями, ключи идемпотентности и Circuit Breaker.",
    highlightEn: "Event-driven resiliency",
    highlightRu: "Событийная отказоустойчивость",
    rulesEn: ["Transactional outbox pattern for events", "Circuit breaker with CLOSED/OPEN/HALF-OPEN states", "Dead letter queues for unhandled failures"],
    rulesRu: ["Паттерн Transactional Outbox для событий", "Circuit Breaker с состояниями CLOSED/OPEN", "Dead Letter Queue для сбойных сообщений"],
  },
  {
    id: "ddd",
    name: "ddd",
    category: "backend",
    categoryLabelEn: "Backend",
    categoryLabelRu: "Бэкенд",
    trigger: "domain/ | aggregate | entity",
    descriptionEn: "Domain-Driven Design, immutable Value Objects, domain events, and aggregate invariants.",
    descriptionRu: "Domain-Driven Design, неизменяемые Value Objects, доменные события и агрегаты.",
    highlightEn: "Immutable Value Objects",
    highlightRu: "Неизменяемые Value Objects",
    rulesEn: ["Zero ORM / HTTP transport leak in domain", "Value Objects immutable by contract", "State transitions protected by Aggregate Root"],
    rulesRu: ["Ноль утечек ORM/HTTP в доменную модель", "Неизменяемые Value Objects", "Мутации только через корень агрегата"],
  },

  // Cross-Cutting & Security
  {
    id: "security",
    name: "security",
    category: "cross",
    categoryLabelEn: "Security",
    categoryLabelRu: "Безопасность",
    trigger: "auth | token | hash | crypto",
    descriptionEn: "Auth patterns, timing attack prevention (timingSafeEqual), input sanitization, and SQL injection prevention.",
    descriptionRu: "Аутентификация, защита от атак по времени (timingSafeEqual), санитайзинг и защита от SQLi.",
    highlightEn: "Zero secret leakage",
    highlightRu: "Ноль утечек секретов",
    rulesEn: ["crypto.timingSafeEqual for token comparisons", "Auth check BEFORE data querying", "Parameterized SQL only — zero concatenation"],
    rulesRu: ["crypto.timingSafeEqual для сравнения токенов", "Проверка авторизации ДО обращения к данным", "Только параметризованный SQL без конкатенации"],
  },
  {
    id: "performance",
    name: "performance",
    category: "cross",
    categoryLabelEn: "Performance",
    categoryLabelRu: "Скорость",
    trigger: "lighthouse | vitals | bundle",
    descriptionEn: "Core Web Vitals optimization, layout stability (CLS < 0.1), and bundle tree-shaking.",
    descriptionRu: "Оптимизация Core Web Vitals, стабильность верстки (CLS < 0.1) и tree-shaking бандлов.",
    highlightEn: "LCP < 2.5s & INP < 200ms",
    highlightRu: "LCP < 2.5с и INP < 200мс",
    rulesEn: ["LCP target < 2.5s, INP < 200ms, CLS < 0.1", "Dynamic imports for heavy client libraries", "Next.js Image component for optimal WebP/AVIF"],
    rulesRu: ["LCP < 2.5с, INP < 200мс, CLS < 0.1", "Динамический импорт тяжелых библиотек", "Оптимизация изображений через next/image"],
  },
  {
    id: "testing",
    name: "testing",
    category: "cross",
    categoryLabelEn: "Testing",
    categoryLabelRu: "Тестирование",
    trigger: "*.test.* | vitest.config.*",
    descriptionEn: "Vitest, React Testing Library behavior tests, and Playwright E2E critical user suites.",
    descriptionRu: "Vitest, поведенческие тесты React Testing Library и сквозные E2E-сьюты на Playwright.",
    highlightEn: "Behavior-driven testing",
    highlightRu: "Поведенческое тестирование",
    rulesEn: ["Test behavior and user contracts, not implementation details", "Cover edge cases: null, unauthorized, timeout", "E2E suites for auth and checkout critical paths"],
    rulesRu: ["Тестировать поведение пользователя, а не детали кода", "Покрытие граничных кейсов: null, 401, таймаут", "Сквозные E2E-тесты критических путей"],
  },
  {
    id: "docker",
    name: "docker",
    category: "cross",
    categoryLabelEn: "DevOps",
    categoryLabelRu: "DevOps",
    trigger: "Dockerfile | docker-compose.*",
    descriptionEn: "Multi-stage Dockerfiles, non-root user execution, layer caching, and container security.",
    descriptionRu: "Многоэтапные Dockerfiles, запуск от non-root пользователя, кэш слоев и безопасность контейнеров.",
    highlightEn: "Multi-stage slim images",
    highlightRu: "Легковесные multi-stage сборки",
    rulesEn: ["Multi-stage builds (deps, builder, runner)", "Non-root user execution in production stage", "Order COPY commands for maximum layer caching"],
    rulesRu: ["Многоэтапная сборка (deps, builder, runner)", "Запуск от непривилегированного non-root пользователя", "Оптимизация порядка COPY для кэша слоев"],
  },
  {
    id: "decisions",
    name: "decisions",
    category: "cross",
    categoryLabelEn: "Architecture",
    categoryLabelRu: "Архитектура",
    trigger: "ADR | docs/decisions/*",
    descriptionEn: "Architectural Decision Records (ADR) format: Decision, Why, Alternatives, Trade-offs.",
    descriptionRu: "Формат Architectural Decision Records (ADR): Решение, Причина, Альтернативы, Трейдоффы.",
    highlightEn: "Tracked ADR history",
    highlightRu: "История архитектурных решений",
    rulesEn: ["Structure: Context | Decision | Why | Alternatives | Trade-offs", "Track numbered ADRs in docs/decisions/", "Never reverse an ADR without new record"],
    rulesRu: ["Формат: Контекст | Решение | Почему | Альтернативы | Трейдоффы", "Нумерация файлов в docs/decisions/", "Фиксация изменений через новый ADR"],
  },
  {
    id: "adapters",
    name: "adapters",
    category: "cross",
    categoryLabelEn: "Integration",
    categoryLabelRu: "Интеграция",
    trigger: "adapters/ | integrations/",
    descriptionEn: "Hexagonal architecture ports & adapters for 3rd-party services and APIs.",
    descriptionRu: "Порты и адаптеры гексагональной архитектуры для сторонних API и сервисов.",
    highlightEn: "Hexagonal isolation",
    highlightRu: "Гексагональная изоляция",
    rulesEn: ["Define port interface in domain/ports/", "Implement external adapter in infrastructure/", "Mock ports in unit tests without network calls"],
    rulesRu: ["Интерфейс порта в domain/ports/", "Реализация адаптера в infrastructure/", "Мокирование портов в тестах без сети"],
  },
];

export function SkillsCarouselSection() {
  const { t, locale } = useLocale();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);

  const isRu = locale === "ru";

  const categories = [
    { id: "all", label: t("skills.all"), icon: Layers },
    { id: "core", label: t("skills.core"), icon: Cpu },
    { id: "frontend", label: t("skills.frontend"), icon: Code },
    { id: "backend", label: t("skills.backend"), icon: Terminal },
    { id: "cross", label: t("skills.cross"), icon: Shield },
  ];

  const filteredSkills = useMemo(() => {
    return skillsData.filter((skill) => {
      const matchCategory = activeCategory === "all" || skill.category === activeCategory;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const name = skill.name.toLowerCase();
      const desc = (isRu ? skill.descriptionRu : skill.descriptionEn).toLowerCase();
      const highlight = (isRu ? skill.highlightRu : skill.highlightEn).toLowerCase();
      const trigger = skill.trigger.toLowerCase();

      return name.includes(q) || desc.includes(q) || highlight.includes(q) || trigger.includes(q);
    });
  }, [activeCategory, searchQuery, isRu]);

  return (
    <section id="skills" className="relative py-24 bg-background text-foreground">
      <div className="max-w-[1200px] mx-auto px-6 space-y-10 w-full">
        {/* Minimalist Section Header */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.0]">
              {t("skills.title")}
            </h2>
            <p className="text-2xl sm:text-4xl font-bold tracking-tight text-muted-foreground leading-[1.05]">
              {t("skills.tagline")}
            </p>
          </div>

          <div className="text-xs sm:text-sm font-mono text-muted-foreground/80 tracking-widest uppercase">
            {t("skills.tags")}
          </div>

          <p className="text-sm sm:text-base text-muted-foreground max-w-xl font-normal">
            {t("skills.subtitle")}
          </p>
        </div>

        {/* Controls: Search & Category Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-mono transition-all border flex items-center gap-1.5 cursor-pointer",
                    activeCategory === cat.id
                      ? "bg-primary text-primary-foreground font-semibold border-primary shadow-xs"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Search Input */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("skills.searchPlaceholder")}
              className="w-full h-9 pl-9 pr-8 text-xs font-mono rounded-full bg-card border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Responsive Bento-Style Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              onClick={() => setSelectedSkill(skill)}
              className="group vercel-card-flat p-5 flex flex-col justify-between cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.01] relative overflow-hidden"
            >
              <div className="space-y-3">
                {/* Header: Skill Name + Category Badge */}
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary/80 group-hover:bg-primary transition-colors" />
                    <span className="font-mono text-sm font-bold text-foreground">
                      `{skill.name}`
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-border text-muted-foreground bg-muted">
                    {isRu ? skill.categoryLabelRu : skill.categoryLabelEn}
                  </span>
                </div>

                {/* Trigger Condition */}
                <div className="text-[11px] font-mono text-muted-foreground/90 truncate">
                  <span className="text-muted-foreground font-semibold">{t("skills.trigger")}: </span>
                  {skill.trigger}
                </div>

                {/* Description */}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {isRu ? skill.descriptionRu : skill.descriptionEn}
                </p>
              </div>

              {/* Bottom Invariant Highlight */}
              <div className="pt-3 mt-4 border-t border-border/30 flex items-center justify-between text-[11px] font-mono">
                <span className="text-foreground font-medium truncate flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary/70 shrink-0" />
                  {isRu ? skill.highlightRu : skill.highlightEn}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                  Inspect →
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Empty Search Fallback */}
        {filteredSkills.length === 0 && (
          <div className="py-16 text-center text-sm font-mono text-muted-foreground border border-dashed border-border rounded-xl">
            No skills found matching &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {/* Interactive Inspect Rule Modal */}
      {selectedSkill && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedSkill(null)}
        >
          <div 
            className="w-full max-w-lg vercel-card-flat bg-card p-6 rounded-xl border border-border shadow-2xl space-y-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-base font-bold text-foreground">
                  `{selectedSkill.name}`
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-border text-muted-foreground bg-muted">
                  {isRu ? selectedSkill.categoryLabelRu : selectedSkill.categoryLabelEn}
                </span>
              </div>
              <button
                onClick={() => setSelectedSkill(null)}
                className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">{t("skills.trigger")}:</div>
                <div className="text-foreground bg-muted/60 p-2 rounded border border-border">
                  {selectedSkill.trigger}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Description:</div>
                <p className="text-foreground leading-relaxed">
                  {isRu ? selectedSkill.descriptionRu : selectedSkill.descriptionEn}
                </p>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Deterministic Rules & Invariants:</div>
                <ul className="space-y-1.5">
                  {(isRu ? selectedSkill.rulesRu : selectedSkill.rulesEn).map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-foreground/90 leading-relaxed bg-muted/40 p-2 rounded border border-border/40">
                      <span className="text-primary font-bold select-none">›</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-border/40 flex justify-end">
              <button
                onClick={() => setSelectedSkill(null)}
                className="px-4 py-1.5 rounded-full text-xs font-mono bg-primary text-primary-foreground font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
