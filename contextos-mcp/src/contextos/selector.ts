/**
 * ContextOS Selector — determines which rules and skills are relevant for a task.
 *
 * Uses keyword matching against the task description to select only the
 * rules and skills that matter, preventing context bloat in agent prompts.
 *
 * The mapping table mirrors the "Automatic Skill Activation Rules" from AGENTS.md.
 */

export interface SelectedContext {
	/** Always-loaded rules (e.g., AGENTS.md core principles). */
	coreRules: string[];
	/** Task-relevant rule files from rules/. */
	rules: string[];
	/** Task-relevant skill directories from core/skills/. */
	skills: string[];
}

interface TriggerRule {
	/** Keywords that trigger this rule (case-insensitive). */
	keywords: string[];
	/** Rule files to load (relative to .agents/rules/). */
	rules: string[];
	/** Skill directories to load (relative to .agents/core/skills/). */
	skills: string[];
}

/**
 * Mapping table: task keywords → relevant rules and skills.
 * Based on the "Automatic Skill Activation Rules" section of AGENTS.md.
 */
const TRIGGER_TABLE: TriggerRule[] = [
	{
		keywords: [
			"component",
			"ui",
			"page",
			"layout",
			"design",
			"button",
			"form",
			"modal",
			"sidebar",
			"navbar",
			"header",
			"footer",
			"компонент",
			"страниц",
			"кнопк",
			"форм",
			"модалк",
			"модальн",
			"верстк",
			"интерфейс",
			"макет",
		],
		rules: [],
		skills: ["react", "typescript", "ui-ux-pro", "ui-design", "ponytail-mindset"],
	},
	{
		keywords: ["next", "nextjs", "next.js", "app router", "server component", "rsc", "server actions", "некст"],
		rules: [],
		skills: ["nextjs", "react", "typescript", "react-best-practices"],
	},
	{
		keywords: [
			"api",
			"endpoint",
			"route",
			"handler",
			"middleware",
			"controller",
			"rest",
			"graphql",
			"эндпоинт",
			"роут",
			"маршрут",
			"контроллер",
			"бэкенд",
			"мидлвар",
		],
		rules: [],
		skills: ["node", "system-design", "security", "ponytail-mindset"],
	},
	{
		keywords: [
			"database",
			"prisma",
			"drizzle",
			"migration",
			"schema",
			"sql",
			"postgres",
			"repository",
			"query",
			"orm",
			"база",
			"баз.*данн",
			"бд",
			"миграц",
			"схем",
			"таблиц",
			"запрос",
		],
		rules: [],
		skills: ["database", "system-design", "decisions"],
	},
	{
		keywords: [
			"docker",
			"container",
			"dockerfile",
			"deploy",
			"compose",
			"kubernetes",
			"k8s",
			"докер",
			"контейнер",
			"деплой",
		],
		rules: [],
		skills: ["docker", "security"],
	},
	{
		keywords: ["state", "store", "zustand", "query", "cache", "tanstack", "стейт", "хранилищ", "кэш", "состояни"],
		rules: [],
		skills: ["state-management", "react", "typescript", "ponytail-mindset"],
	},
	{
		keywords: [
			"test",
			"unit test",
			"playwright",
			"vitest",
			"tdd",
			"spec",
			"coverage",
			"bdd",
			"тест",
			"тестирован",
			"покрыти",
			"юнит",
		],
		rules: [],
		skills: ["testing", "typescript", "engineering-workflow"],
	},
	{
		keywords: [
			"auth",
			"login",
			"signup",
			"password",
			"jwt",
			"session",
			"oauth",
			"permission",
			"rbac",
			"авториз",
			"аутентифик",
			"вход",
			"парол",
			"токен",
			"права",
			"безопасност",
		],
		rules: [],
		skills: ["security", "system-design"],
	},
	{
		keywords: [
			"performance",
			"slow",
			"optimize",
			"lighthouse",
			"core web vitals",
			"bundle",
			"lazy",
			"waterfall",
			"производительн",
			"оптимиз",
			"медленн",
			"ускор",
			"быстродействи",
		],
		rules: [],
		skills: ["performance", "system-design", "vercel-optimize"],
	},
	{
		keywords: ["accessibility", "aria", "wcag", "screen reader", "a11y", "доступност", "скринридер"],
		rules: [],
		skills: ["web-accessibility", "ui-ux-pro"],
	},
	{
		keywords: [
			"style",
			"css",
			"tailwind",
			"color",
			"typography",
			"font",
			"theme",
			"dark mode",
			"стил",
			"цвета",
			"шрифт",
			"темн.*тем",
			"тема",
		],
		rules: [],
		skills: ["ui-design", "ui-ux-pro"],
	},
	{
		keywords: ["brutalist", "sharp", "mechanical", "swiss", "брутализм", "бруталист"],
		rules: [],
		skills: ["brutalist-design", "ui-ux-pro"],
	},
	{
		keywords: ["minimalist", "clean", "notion", "минимализм", "минималист"],
		rules: [],
		skills: ["minimalist-design", "ui-ux-pro"],
	},
	{
		keywords: ["soft", "calm", "premium", "мягкий"],
		rules: [],
		skills: ["soft-design", "ui-ux-pro"],
	},
	{
		keywords: [
			"architecture",
			"refactor",
			"structure",
			"domain",
			"bounded context",
			"ddd",
			"архитектур",
			"рефактор",
			"структур",
			"домен",
		],
		rules: [],
		skills: ["system-design", "ddd", "microservices", "decisions"],
	},
	{
		keywords: [
			"microservice",
			"service",
			"event",
			"message",
			"queue",
			"pubsub",
			"kafka",
			"rabbitmq",
			"микросервис",
			"очеред",
			"событи",
		],
		rules: [],
		skills: ["microservices", "system-design"],
	},
	{
		keywords: ["fastapi", "python", "pydantic", "uvicorn", "питон"],
		rules: [],
		skills: ["fastapi", "system-design", "security"],
	},
	{
		keywords: ["nestjs", "nest", "dependency injection", "@nestjs", "нест"],
		rules: [],
		skills: ["nestjs", "node", "typescript", "system-design"],
	},
	{
		keywords: ["graphify", "ast", "dependency graph", "knowledge graph", "граф зависимост", "граф проект"],
		rules: [],
		skills: ["graphify", "system-design", "context-manager"],
	},
	{
		keywords: ["subagent", "delegate", "parallel", "orchestrat", "субагент", "делегируй", "распараллел", "оркестрац"],
		rules: [],
		skills: ["subagent-orchestrator", "engineering-workflow", "ponytail-mindset"],
	},
	{
		keywords: ["diagram", "flowchart", "sequence diagram", "диаграмм", "схем", "нарисуй"],
		rules: [],
		skills: ["architecture-diagrams", "system-design"],
	},
	{
		keywords: ["interview", "clarify", "questions", "интервью", "уточни", "расспроси"],
		rules: [],
		skills: ["interview-me", "engineering-workflow"],
	},
];

/**
 * Select relevant rules and skills for a given task description.
 *
 * @param task - The task description text
 * @returns SelectedContext with lists of relevant rule/skill identifiers
 */
export function selectContext(task: string): SelectedContext {
	const lowerTask = task.toLowerCase();

	const matchedRules = new Set<string>();
	const matchedSkills = new Set<string>();

	for (const trigger of TRIGGER_TABLE) {
		const isMatch = trigger.keywords.some((kw) => lowerTask.includes(kw.toLowerCase()));
		if (isMatch) {
			for (const rule of trigger.rules) matchedRules.add(rule);
			for (const skill of trigger.skills) matchedSkills.add(skill);
		}
	}

	return {
		coreRules: ["AGENTS.md"],
		rules: [...matchedRules],
		skills: [...matchedSkills],
	};
}
