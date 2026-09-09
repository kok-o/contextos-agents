/**
 * ContextOS Selector — determines which rules and skills are relevant for a task.
 *
 * Uses weighted scoring against task description to select the exact 2–4 skills
 * needed for the immediate task, preventing context bloat in agent prompts.
 *
 * Implements:
 * 1. Strong (10 pts), Medium (5 pts), and Weak (2 pts) regex triggers with word boundaries.
 * 2. Minimum threshold (>= 5 pts) to reject casual mentions (e.g., "container", "type", "query").
 * 3. Sorting by relevance and a hard cap of maximum 4 skills (exact 2–4 domain skills).
 * 4. Architectural synergy resolution (e.g., system-design for database/microservices/ddd).
 */

export interface SelectedContext {
	/** Always-loaded rules (e.g., AGENTS.md core principles). */
	coreRules: string[];
	/** Task-relevant rule files from rules/. */
	rules: string[];
	/** Task-relevant skill directories from core/skills/. */
	skills: string[];
}

export interface SelectorOptions {
	/** Maximum number of skills to activate (default: 4, hard cap at 4). */
	maxSkills?: number;
	/** File paths touched or relevant to task for file-pattern boosting. */
	files?: string[];
}

interface SkillRule {
	skill: string;
	strong: RegExp[];
	medium: RegExp[];
	weak: RegExp[];
	rules?: string[];
	fileGlobs?: RegExp[];
}

/**
 * Weighted skill triggers based on AGENTS.md matrix.
 */
export const SKILL_RULES: SkillRule[] = [
	{
		skill: "nextjs",
		strong: [/\bnext(?:\.js)?\b/i, /\bapp\s*router\b/i, /\bserver\s*actions?\b/i, /\brsc\b/i, /некст/i],
		medium: [/\bpage\.tsx\b/i, /\blayout\.tsx\b/i],
		weak: [],
		fileGlobs: [/app\/.*\.(tsx|jsx|ts|js)$/, /next\.config\./],
	},
	{
		skill: "react",
		strong: [/\breact\b/i, /\buseOptimistic\b/i, /компонент/i, /хук/i],
		medium: [
			/\bcomponent\b/i,
			/\bhooks?\b/i,
			/\buseState\b/i,
			/\buseEffect\b/i,
			/\buseMemo\b/i,
			/\bprops\b/i,
			/модал\w*/i,
		],
		weak: [],
		fileGlobs: [/\.(tsx|jsx)$/],
	},
	{
		skill: "typescript",
		strong: [
			/\btypescript\b/i,
			/\btype-?safe\b/i,
			/\bgenerics?\b/i,
			/\binterface\b/i,
			/\btsconfig\b/i,
			/тайпскрипт/i,
			/типизац/i,
		],
		medium: [],
		weak: [/\btypes?\b/i],
		fileGlobs: [/\.tsx?$/, /tsconfig\.json$/],
	},
	{
		skill: "ui-ux-pro",
		strong: [/\bui\b/i, /\bux\b/i, /\btailwind\b/i, /\bstyling\b/i, /дизайн/i, /верстк/i, /макет/i, /интерфейс/i],
		medium: [/\bcss\b/i, /\btheme\b/i, /\bmodal\b/i, /\bbutton\b/i, /модал\w*/i, /кнопк/i],
		weak: [/\bdesign\b/i],
		fileGlobs: [/\.(css|scss|sass)$/, /tailwind\.config\./],
	},
	{
		skill: "web-accessibility",
		strong: [
			/\baccessib\w*\b/i,
			/\ba11y\b/i,
			/\baria\b/i,
			/\bfocus\s*trap\b/i,
			/\bkeyboard\s*nav/i,
			/\bwcag\b/i,
			/\bscreen\s*reader\b/i,
			/доступност/i,
			/скринридер/i,
		],
		medium: [],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "impeccable-design",
		strong: [
			/\bvisual\s*qa\b/i,
			/\bmicro-?animation\b/i,
			/\bglassmorphism\b/i,
			/\btypography\b/i,
			/анимац/i,
			/полировк/i,
		],
		medium: [/\bpolish\b/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "database",
		strong: [
			/\bdatabase\b/i,
			/\bsql\b/i,
			/\bpostgres(?:ql)?\b/i,
			/\bprisma\b/i,
			/\bdrizzle\b/i,
			/\bmigration\b/i,
			/\borm\b/i,
			/баз.*данн/i,
			/миграц/i,
			/таблиц/i,
		],
		medium: [/\bschema\b/i],
		weak: [/\bquery\b/i, /\bindex(?:ing)?\b/i],
		fileGlobs: [/\.prisma$/, /drizzle\.config\./, /\bmigrations?\/.*\.sql$/],
	},
	{
		skill: "security",
		strong: [
			/\bsecurity\b/i,
			/\bauth\b/i,
			/\bjwt\b/i,
			/\blogin\b/i,
			/\bcsrf\b/i,
			/\bxss\b/i,
			/\brate\s*limit\b/i,
			/авториз/i,
			/аутентифик/i,
			/парол/i,
			/безопасност/i,
		],
		medium: [/\bpermission\b/i, /\bsession\b/i, /\btoken\b/i, /токен/i],
		weak: [],
		fileGlobs: [/\bauth\b/, /\bsecurity\b/],
	},
	{
		skill: "performance",
		strong: [
			/\bperformance\b/i,
			/\blatency\b/i,
			/\blcp\b/i,
			/\bcls\b/i,
			/\binp\b/i,
			/\bcore\s*web\s*vitals\b/i,
			/\bwaterfall\b/i,
			/\bbundle\s*size\b/i,
			/производительн/i,
			/ускор/i,
		],
		medium: [/\boptimize\b/i, /\bslow\b/i, /оптимиз/i, /медленн/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "testing",
		strong: [
			/\bvitest\b/i,
			/\bjest\b/i,
			/\bplaywright\b/i,
			/\btdd\b/i,
			/\bbdd\b/i,
			/\be2e\b/i,
			/тестирован/i,
			/покрыти/i,
			/юнит/i,
		],
		medium: [/\btest(?:s|ing)?\b/i, /\bmock\b/i, /тест/i],
		weak: [],
		fileGlobs: [/\.(test|spec)\.(ts|js|tsx|jsx|py)$/, /vitest\.config\./, /playwright\.config\./],
	},
	{
		skill: "docker",
		strong: [/\bdocker\b/i, /\bdockerfile\b/i, /\bcompose\b/i, /\bkubernetes\b/i, /\bk8s\b/i, /докер/i],
		medium: [],
		weak: [/\bcontainer\b/i, /контейнер/i],
		fileGlobs: [/Dockerfile/, /docker-compose\./],
	},
	{
		skill: "fastapi",
		strong: [/\bfastapi\b/i, /\bpydantic\b/i, /\buvicorn\b/i, /\bpytest\b/i, /питон/i],
		medium: [/\bpython\b/i],
		weak: [],
		fileGlobs: [/\.py$/, /requirements\.txt$/, /pyproject\.toml$/],
	},
	{
		skill: "nestjs",
		strong: [/\bnestjs\b/i, /\b@nestjs\b/i, /нест/i],
		medium: [],
		weak: [/\bmodule\b/i, /\bcontroller\b/i, /\binjectable\b/i],
		fileGlobs: [/nest-cli\.json$/],
	},
	{
		skill: "node",
		strong: [/\bnode(?:\.js)?\b/i, /\bexpress\b/i, /\bfastify\b/i],
		medium: [/\bbackend\b/i, /\bapi\s*route\b/i, /бэкенд/i, /эндпоинт/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "ddd",
		strong: [/\bddd\b/i, /\bdomain-?driven\b/i, /\baggregate\b/i, /\bvalue\s*object\b/i, /\bbounded\s*context\b/i],
		medium: [/\bentity\b/i, /домен/i, /агрегат/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "microservices",
		strong: [/\bmicroservices?\b/i, /\bevent-?driven\b/i, /\brabbitmq\b/i, /\bkafka\b/i, /\bgrpc\b/i, /микросервис/i],
		medium: [/\bpub\/?sub\b/i, /очеред/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "system-design",
		strong: [/\bsystem\s*design\b/i, /\bhigh\s*concurrency\b/i, /\bcircuit\s*breaker\b/i, /масштабируем/i],
		medium: [/\barchitecture\b/i, /\bscalab(?:le|ility)\b/i, /архитектур/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "graphify",
		strong: [
			/\bgraphify\b/i,
			/\bknowledge\s*graph\b/i,
			/\bcodebase\s*graph\b/i,
			/\bproject\s*graph\b/i,
			/\bblast\s*radius\b/i,
			/\bmap\s*(?:the\s*)?codebase\b/i,
			/граф\s*проект/i,
			/граф\s*зависимост/i,
		],
		medium: [],
		weak: [],
		fileGlobs: [/graph\.json$/, /GRAPH_REPORT\.md$/],
	},
	{
		skill: "architecture-diagrams",
		strong: [/\bflowchart\b/i, /\bsequence\s*diagram\b/i],
		medium: [/\bdiagrams?\b/i, /диаграмм/i, /схем/i, /нарисуй/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "subagent-orchestrator",
		strong: [/\bsubagent\b/i, /\bparallel\s*tasks\b/i, /субагент/i, /распараллел/i],
		medium: [/\bdelegate\b/i, /делегируй/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "interview-me",
		strong: [/\binterview\b/i, /интервью/i, /расспроси/i],
		medium: [/\bclarify\b/i, /\bquestions\b/i, /уточни\b/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "state-management",
		strong: [/\bzustand\b/i, /\btanstack\s*query\b/i, /\bredox\b/i, /\bpinia\b/i, /стейт/i, /хранилищ/i],
		medium: [/\bstate\b/i, /\bstore\b/i],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "brutalist-design",
		strong: [/\bbrutalist\b/i, /\bbrutalism\b/i, /брутализм/i, /бруталист/i],
		medium: [],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "minimalist-design",
		strong: [/\bminimalist\b/i, /\bminimalism\b/i, /минимализм/i, /минималист/i],
		medium: [],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "soft-design",
		strong: [/\bsoft-design\b/i, /мягкий\s*дизайн/i],
		medium: [],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "redesign-audit",
		strong: [/\bredesign-audit\b/i, /\baudit\s*ui\b/i, /аудит\s*интерфейс/i],
		medium: [],
		weak: [],
		fileGlobs: [],
	},
	{
		skill: "vercel-optimize",
		strong: [/\bvercel-optimize\b/i, /\bvercel\s*edge\b/i],
		medium: [/\bvercel\b/i],
		weak: [],
		fileGlobs: [/vercel\.json$/],
	},
];

/**
 * Select relevant rules and skills for a given task description with relevance scoring and hard capping.
 *
 * @param task - The task description text
 * @param options - Optional configuration (maxSkills cap, touched files)
 * @returns SelectedContext with lists of relevant rule/skill identifiers (max 4 skills)
 */
export function selectContext(task: string, options: SelectorOptions = {}): SelectedContext {
	const taskText = task || "";
	const files = options.files || [];
	const maxSkills = Math.max(1, Math.min(4, options.maxSkills ?? 4));

	const scores = new Map<string, { score: number; rules: string[] }>();

	for (const rule of SKILL_RULES) {
		let score = 0;

		// Strong matches (+10 points)
		for (const pat of rule.strong) {
			if (pat.test(taskText)) score += 10;
		}

		// Medium matches (+5 points)
		for (const pat of rule.medium) {
			if (pat.test(taskText)) score += 5;
		}

		// Weak matches (+2 points)
		for (const pat of rule.weak) {
			if (pat.test(taskText)) score += 2;
		}

		// File matches (+10 points per matched file)
		for (const file of files) {
			const normalized = file.replace(/\\/g, "/");
			for (const pat of rule.fileGlobs || []) {
				if (pat.test(normalized)) score += 10;
			}
		}

		// Minimum score threshold of 5 points prevents single casual weak matches from activating heavy skills
		if (score >= 5) {
			scores.set(rule.skill, {
				score,
				rules: rule.rules || [],
			});
		}
	}

	// Sort candidate domain skills strictly by relevance score descending
	const sortedSkills = Array.from(scores.entries())
		.sort((a, b) => b[1].score - a[1].score)
		.map(([skill]) => skill);

	// Cap to top skills within maxSkills ceiling
	const topSkills = sortedSkills.slice(0, maxSkills);

	// Synergy resolution: if database, microservices, ddd or graphify is present,
	// ensure system-design is included if room permits within the hard cap
	const hasSynergyPrereq =
		topSkills.includes("database") ||
		topSkills.includes("microservices") ||
		topSkills.includes("ddd") ||
		topSkills.includes("graphify");

	if (hasSynergyPrereq && !topSkills.includes("system-design") && topSkills.length < maxSkills) {
		topSkills.push("system-design");
	}

	// Transitive Dependency Resolution (from skill.yaml manifests)
	const SKILL_DEPENDENCIES: Record<string, string[]> = {
		react: ["typescript"],
		node: ["typescript"],
		nextjs: ["react", "typescript"],
		nestjs: ["node", "typescript"],
		microservices: ["system-design"],
		"vercel-optimize": ["nextjs", "react", "typescript"],
	};

	for (let i = 0; i < topSkills.length; i++) {
		const s = topSkills[i];
		const deps = SKILL_DEPENDENCIES[s] || [];
		for (const dep of deps) {
			if (!topSkills.includes(dep) && topSkills.length < maxSkills) {
				topSkills.push(dep);
			}
		}
	}

	// Collect any specific rules from matched skills
	const matchedRules = new Set<string>();
	for (const skill of topSkills) {
		const ruleObj = scores.get(skill);
		if (ruleObj) {
			for (const r of ruleObj.rules) matchedRules.add(r);
		}
	}

	return {
		coreRules: ["AGENTS.md"],
		rules: [...matchedRules],
		skills: topSkills,
	};
}
