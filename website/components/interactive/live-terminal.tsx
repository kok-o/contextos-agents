"use client";

import React, { useState, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, Sparkles, Copy, Check, Play, CornerDownLeft } from "lucide-react";
import { useLocale } from "@/lib/intl/provider";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface OutputLine {
  id: string;
  type: "input" | "output" | "system" | "error" | "ascii" | "matrix";
  content: string | React.ReactNode;
}

const ASCII_LOGO = `
    ██████╗ ██████╗ ███╗   ██╗████████╗███████╗██╗  ██╗████████╗ ██████╗ ███████╗
   ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔════╝╚██╗██╔╝╚══██╔══╝██╔═══██╗██╔════╝
   ██║     ██║   ██║██╔██╗ ██║   ██║   █████╗   ╚███╔╝    ██║   ██║   ██║███████╗
   ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══╝   ██╔██╗    ██║   ██║   ██║╚════██║
   ╚██████╗╚██████╔╝██║ ╚████║   ██║   ███████╗██╔╝ ██╗   ██║   ╚██████╔╝███████║
    ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝
`;

const IDE_CONFIGS: Record<string, { name: string; file: string; sample: string; desc: string }> = {
  cursor: {
    name: "Cursor",
    file: ".cursor/rules/contextos.mdc",
    desc: "Modular MDC rule trees with task globs",
    sample: `---
description: ContextOS Core Engineering Rules
globs: ["**/*.ts", "**/*.tsx", "**/*.py"]
---
# ContextOS AST Protocol Active
- Run Ponytail 7-rung ladder before any code generation (-54% code)
- Business logic strictly isolated in services/ and use-cases/
- Enforce timingSafeEqual on all auth tokens`,
  },
  claude: {
    name: "Claude Code",
    file: ".agents/claude/skills",
    desc: "Native /skills directory resolution",
    sample: `// ContextOS Claude Code Skill Resolution
/skills/engineering-workflow: ACTIVE (Phase: BUILD)
/skills/ponytail-mindset: ACTIVE (Minimalist ladder)
/skills/impeccable-design: ACTIVE (50 Design Invariants)`,
  },
  gemini: {
    name: "Antigravity",
    file: "skills.json & rules/",
    desc: "Eager & lazy MCP + slash commands",
    sample: `{
  "contextos": {
    "version": "1.2.0",
    "skills": 28,
    "slashCommands": ["/spec", "/plan", "/build", "/test", "/review", "/ship"],
    "ponytailLevel": 7
  }
}`,
  },
  copilot: {
    name: "Copilot",
    file: ".github/copilot-instructions.md",
    desc: "Compiled architectural contracts",
    sample: `# GitHub Copilot ContextOS Architectural Invariants
1. Do not hallucinate bloated libraries.
2. Validate user inputs and SQL params before query execution.
3. Keep component cyclomatic complexity < 10.`,
  },
  zed: {
    name: "Zed",
    file: ".zed/rules.md",
    desc: "Slash prompt templates & context",
    sample: `## ContextOS Zed Slash Prompts
/spec  - Define acceptance criteria and out-of-scope boundaries
/plan  - Atomic task breakdown (<2h per unit)
/build - Ponytail minimalist senior code generation`,
  },
};

const ALL_SKILLS = [
  "gstack-roles", "engineering-workflow", "ponytail-mindset",
  "ui-ux-pro", "impeccable-design", "react", "nextjs", "typescript",
  "web-accessibility", "ui-design", "ux-design",
  "system-design", "database", "node", "fastapi", "nestjs", "microservices", "ddd",
  "security", "performance", "testing", "docker", "decisions", "adapters", "generators"
];

export function LiveTerminal() {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [activeIde, setActiveIde] = useState<string>("cursor");
  const [inputVal, setInputVal] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isMatrixRunning, setIsMatrixRunning] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const isRu = locale === "ru";

  const [output, setOutput] = useState<OutputLine[]>([
    {
      id: "init-1",
      type: "system",
      content: isRu 
        ? "ContextOS v1.2.0 (Open-Source AI Engineering System). Введите 'help' для списка команд или кликните быстрые кнопки ниже."
        : "ContextOS v1.2.0 (Open-Source AI Engineering System). Type 'help' or click the quick action chips below.",
    },
  ]);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [output, isMatrixRunning, isSimulating]);

  const appendLine = (type: OutputLine["type"], content: string | React.ReactNode) => {
    setOutput((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, content },
    ]);
  };

  const copyInstall = () => {
    navigator.clipboard.writeText("npx koko-contextos-agents");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    appendLine("system", isRu ? "✓ Скопировано: npx koko-contextos-agents" : "✓ Copied to clipboard: npx koko-contextos-agents");
  };

  const runSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);

    const steps = isRu ? [
      { delay: 300, msg: "⚡ Инициализация агентного пайплайна ContextOS..." },
      { delay: 900, msg: "📋 [ROLE: Product Manager] /spec → Определение скоупа, требований и границ задачи" },
      { delay: 1600, msg: "📐 [ROLE: Architect] /plan → Декомпозиция на атомарные задачи (<2ч) и выбор скилов [react, typescript, ui-ux-pro]" },
      { delay: 2400, msg: "🧗 [ROLE: Senior Dev] /build → Запуск лестницы Ponytail: пропуск ненужных зависимостей, сокращение кода на 54%" },
      { delay: 3200, msg: "🛡️ [ROLE: Security Officer] /verify → Проверка timingSafeEqual, санитизация входов, ноль утечек стэка [PASS]" },
      { delay: 3900, msg: "✨ Результат: Безупречный продакшен-код готов за 4 секунды с нулевым загрязнением контекста!" },
    ] : [
      { delay: 300, msg: "⚡ Initializing ContextOS Agent Pipeline..." },
      { delay: 900, msg: "📋 [ROLE: Product Manager] /spec → Defining acceptance criteria & out-of-scope boundaries" },
      { delay: 1600, msg: "📐 [ROLE: Architect] /plan → Atomic breakdown (<2h) & loading skills [react, typescript, ui-ux-pro]" },
      { delay: 2400, msg: "🧗 [ROLE: Senior Dev] /build → Executing Ponytail ladder: zero bloat, 54% less code generated" },
      { delay: 3200, msg: "🛡️ [ROLE: Security Officer] /verify → timingSafeEqual check, input sanitization [PASS]" },
      { delay: 3900, msg: "✨ Output: Production-ready senior code delivered with 0 tokens wasted!" },
    ];

    steps.forEach(({ delay, msg }) => {
      setTimeout(() => {
        appendLine("system", msg);
        if (delay === 3900) {
          setIsSimulating(false);
        }
      }, delay);
    });
  };

  const runMatrix = () => {
    setIsMatrixRunning(true);
    appendLine("matrix", isRu ? ">>> Запуск матрицы ContextOS..." : ">>> Initializing ContextOS Matrix Stream...");

    let counter = 0;
    const interval = setInterval(() => {
      const chars = "0101010101010101010101010101010101010101010101010101";
      const randomLine = Array.from({ length: 48 }, () => 
        chars[Math.floor(Math.random() * chars.length)]
      ).join(" ");
      appendLine("matrix", randomLine);
      counter++;

      if (counter > 8) {
        clearInterval(interval);
        setIsMatrixRunning(false);
        appendLine("system", isRu ? ">>> Матрица завершена. Все 50 инвариантов активны." : ">>> Matrix stream completed. All 50 invariants armed.");
      }
    }, 250);
  };

  const handleCommand = (rawCmd: string) => {
    const cmd = rawCmd.trim();
    if (!cmd) return;

    appendLine("input", `$ ${cmd}`);
    setHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputVal("");

    const lower = cmd.toLowerCase();

    switch (lower) {
      case "help":
        appendLine("output", (
          <div className="space-y-1.5 py-1">
            <div className="text-primary font-bold">{isRu ? "Доступные команды:" : "Available commands:"}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
              <div><b className="text-foreground">ctxfetch / neofetch</b> - {isRu ? "ASCII логотип и системные статы" : "ASCII logo & system stats"}</div>
              <div><b className="text-foreground">matrix</b> - {isRu ? "Эффект цифрового дождя матрицы" : "Matrix digital rain effect"}</div>
              <div><b className="text-foreground">demo / spec</b> - {isRu ? "Симуляция 6-фазного пайплайна" : "Simulate 6-phase pipeline"}</div>
              <div><b className="text-foreground">skills</b> - {isRu ? "Список 28 модульных скилов" : "List all 28 modular skills"}</div>
              <div><b className="text-foreground">ponytail</b> - {isRu ? "7-ступенчатая лестница решений" : "7-rung minimalist ladder"}</div>
              <div><b className="text-foreground">theme</b> - {isRu ? "Переключить тему (Dark / Light)" : "Toggle theme (Dark / Light)"}</div>
              <div><b className="text-foreground">lang</b> - {isRu ? "Сменить язык (EN / RU)" : "Switch language (EN / RU)"}</div>
              <div><b className="text-foreground">install</b> - {isRu ? "Команда установки npx" : "npx install command"}</div>
              <div><b className="text-foreground">clear</b> - {isRu ? "Очистить консоль" : "Clear terminal screen"}</div>
              <div><b className="text-foreground">coffee</b> - {isRu ? "Сварить эспрессо разработчику" : "Brew dev espresso"}</div>
            </div>
          </div>
        ));
        break;

      case "ctxfetch":
      case "neofetch":
        appendLine("ascii", (
          <div className="py-2 space-y-2">
            <pre className="text-[10px] sm:text-xs leading-tight text-primary font-mono select-none overflow-x-auto">
              {ASCII_LOGO}
            </pre>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border-t border-border/40 pt-2 text-muted-foreground">
              <div><span className="text-foreground font-semibold">OS:</span> ContextOS v1.2.0 (Open-Source)</div>
              <div><span className="text-foreground font-semibold">Target IDEs:</span> Cursor, Claude, Gemini, Copilot, Zed</div>
              <div><span className="text-foreground font-semibold">Loaded Skills:</span> 28 Modular AST Rules</div>
              <div><span className="text-foreground font-semibold">Resolution Speed:</span> Sub-2ms AST Matcher</div>
              <div><span className="text-foreground font-semibold">Code Overhead:</span> -54% (Ponytail Mindset)</div>
              <div><span className="text-foreground font-semibold">Token Waste:</span> 0 KB (Lazy Loading)</div>
            </div>
          </div>
        ));
        break;

      case "matrix":
        runMatrix();
        break;

      case "demo":
      case "spec":
      case "simulate":
        runSimulation();
        break;

      case "skills":
        appendLine("output", (
          <div className="space-y-2 py-1">
            <div className="font-semibold text-foreground">{isRu ? "28 активных модульных скилов:" : "28 active modular skills:"}</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SKILLS.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded text-[11px] font-mono bg-secondary text-foreground border border-border">
                  `{s}`
                </span>
              ))}
            </div>
          </div>
        ));
        break;

      case "ponytail":
        appendLine("output", (
          <div className="space-y-1.5 py-1 text-xs text-muted-foreground">
            <div className="font-bold text-foreground">{isRu ? "7-ступенчатая лестница Ponytail:" : "Ponytail 7-Rung Decision Ladder:"}</div>
            <div>1. Не писать код вообще (найти встроенное решение / конфиг)</div>
            <div>2. Использовать нативный API платформы (Web Standard, Node builtin)</div>
            <div>3. Использовать существующую библиотеку из package.json</div>
            <div>4. Добавить минимальную чистую функцию в utils/</div>
            <div>5. Создать изолированный сервис / use-case</div>
            <div>6. Расширить схему / интерфейс типов</div>
            <div>7. Добавить внешнюю зависимость (только если rungs 1-6 не подошли)</div>
            <div className="text-primary font-semibold pt-1">Результат: на 54% меньше лишнего кода без потери безопасности.</div>
          </div>
        ));
        break;

      case "theme":
        setTheme(theme === "dark" ? "light" : "dark");
        appendLine("system", isRu ? `Тема переключена на: ${theme === "dark" ? "Light" : "Dark"}` : `Theme switched to: ${theme === "dark" ? "Light" : "Dark"}`);
        break;

      case "lang":
      case "locale":
        setLocale(locale === "en" ? "ru" : "en");
        appendLine("system", isRu ? "Language switched to English" : "Язык переключен на Русский");
        break;

      case "install":
        copyInstall();
        break;

      case "clear":
      case "cls":
        setOutput([]);
        break;

      case "coffee":
        appendLine("output", "☕ [OK] Senior-grade espresso brewed! Productivity +50%, Hallucinations 0%.");
        break;

      case "whoami":
        appendLine("output", "root@developer: Senior Full-Stack Engineer (ContextOS Active)");
        break;

      case "sudo":
        appendLine("output", isRu ? "Вам не нужен sudo: вы уже главный архитектор в своем репозитории." : "Permission granted: you are already the principal architect.");
        break;

      default:
        appendLine("error", isRu 
          ? `Команда не найдена: '${cmd}'. Введите 'help' для списка команд.` 
          : `Command not found: '${cmd}'. Type 'help' for available commands.`);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCommand(inputVal);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (history.length > 0 && historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx >= history.length) {
          setHistoryIndex(-1);
          setInputVal("");
        } else {
          setHistoryIndex(nextIdx);
          setInputVal(history[nextIdx] || "");
        }
      }
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 text-left">
      {/* Interactive Quick Chip Bar */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase text-muted-foreground font-semibold flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-primary" />
            {isRu ? "Быстрые команды:" : "Quick actions:"}
          </span>
          <button
            onClick={() => handleCommand("ctxfetch")}
            className="px-2.5 py-1 rounded-full text-xs font-mono bg-secondary hover:bg-muted border border-border text-foreground transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
          >
            ctxfetch
          </button>
          <button
            onClick={() => handleCommand("demo")}
            disabled={isSimulating}
            className="px-2.5 py-1 rounded-full text-xs font-mono bg-secondary hover:bg-muted border border-border text-foreground transition-all shrink-0 flex items-center gap-1 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Play className="w-2.5 h-2.5" />
            {isRu ? "симуляция /spec" : "demo /spec"}
          </button>
          <button
            onClick={() => handleCommand("matrix")}
            disabled={isMatrixRunning}
            className="px-2.5 py-1 rounded-full text-xs font-mono bg-secondary hover:bg-muted border border-border text-foreground transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
          >
            matrix
          </button>
          <button
            onClick={() => handleCommand("skills")}
            className="px-2.5 py-1 rounded-full text-xs font-mono bg-secondary hover:bg-muted border border-border text-foreground transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
          >
            skills
          </button>
          <button
            onClick={() => handleCommand("ponytail")}
            className="px-2.5 py-1 rounded-full text-xs font-mono bg-secondary hover:bg-muted border border-border text-foreground transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer"
          >
            ponytail
          </button>
        </div>

        <button
          onClick={copyInstall}
          className="px-3 py-1 rounded-full text-xs font-mono bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 shrink-0 hover:opacity-90 active:scale-95 shadow-sm transition-all cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          <span>npx install</span>
        </button>
      </div>

      {/* Main Showcase Window */}
      <div className="vercel-window shadow-2xl relative">
        {/* Titlebar with IDE Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border bg-muted/60 px-4 py-2.5 gap-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-mono font-bold text-foreground flex items-center gap-1.5 pr-2 border-r border-border">
              <TerminalIcon className="w-3.5 h-3.5" />
              ctx-sh
            </span>

            {Object.entries(IDE_CONFIGS).map(([key, ide]) => (
              <button
                key={key}
                onClick={() => setActiveIde(key)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer",
                  activeIde === key
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {ide.name}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-mono text-muted-foreground">
            <span className="truncate max-w-[240px] text-[11px]">
              {IDE_CONFIGS[activeIde].file}
            </span>
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
            </div>
          </div>
        </div>

        {/* Terminal Screen Body */}
        <div 
          onClick={() => inputRef.current?.focus()}
          className="p-5 font-mono text-xs sm:text-sm min-h-[300px] max-h-[420px] overflow-y-auto bg-card text-card-foreground space-y-2 cursor-text select-text"
        >
          {/* Active IDE Preview Banner */}
          <div className="p-3 rounded bg-muted/40 border border-border/40 text-xs font-mono text-muted-foreground space-y-1 select-none">
            <div className="flex items-center justify-between text-foreground font-semibold">
              <span>Target: {IDE_CONFIGS[activeIde].name} ({IDE_CONFIGS[activeIde].file})</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold">READY</span>
            </div>
            <pre className="text-[11px] text-muted-foreground/90 font-mono overflow-x-auto whitespace-pre">
              {IDE_CONFIGS[activeIde].sample}
            </pre>
          </div>

          {/* Terminal Output Stream */}
          {output.map((line) => (
            <div key={line.id} className="leading-relaxed">
              {line.type === "input" && (
                <div className="flex items-center gap-2 text-foreground font-bold">
                  <span className="text-primary select-none">ctx &gt;</span>
                  <span>{line.content}</span>
                </div>
              )}
              {line.type === "system" && (
                <div className="text-primary/90 font-medium">{line.content}</div>
              )}
              {line.type === "output" && (
                <div className="text-foreground">{line.content}</div>
              )}
              {line.type === "ascii" && (
                <div className="text-foreground">{line.content}</div>
              )}
              {line.type === "matrix" && (
                <div className="text-green-500 font-mono tracking-widest text-xs opacity-90">{line.content}</div>
              )}
              {line.type === "error" && (
                <div className="text-red-400 font-mono">{line.content}</div>
              )}
            </div>
          ))}

          {/* Live Prompt Input Line */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-primary font-bold select-none">ctx &gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRu ? "Введите команду (help, ctxfetch, demo, matrix...)" : "Type command (help, ctxfetch, demo, matrix...)"}
              className="flex-1 bg-transparent border-none outline-hidden text-foreground font-mono text-xs sm:text-sm placeholder:text-muted-foreground/50 focus:ring-0 p-0"
              autoFocus
            />
            <button
              onClick={() => handleCommand(inputVal)}
              aria-label="Send command"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
