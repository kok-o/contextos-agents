import {
	type Action,
	type FinishAction,
	type InspectDiffAction,
	type MergeAction,
	parseAction,
	type ReviewAction,
	type SpawnAction,
	type WaitAction,
} from "./action-schema.js";

export interface ActionHandlers {
	spawn(action: SpawnAction): Promise<unknown>;
	wait(action: WaitAction): Promise<unknown>;
	inspectDiff(action: InspectDiffAction): Promise<unknown>;
	review(action: ReviewAction): Promise<unknown>;
	merge(action: MergeAction): Promise<unknown>;
	finish(action: FinishAction): Promise<unknown>;
}

export class ActionDispatcher {
	constructor(private readonly handlers: ActionHandlers) {}

	async dispatch(input: unknown): Promise<unknown> {
		const action = parseAction(input);
		return this.dispatchValidated(action);
	}

	private async dispatchValidated(action: Action): Promise<unknown> {
		switch (action.action) {
			case "spawn":
				return this.handlers.spawn(action);
			case "wait":
				return this.handlers.wait(action);
			case "inspect_diff":
				return this.handlers.inspectDiff(action);
			case "review":
				return this.handlers.review(action);
			case "merge":
				return this.handlers.merge(action);
			case "finish":
				return this.handlers.finish(action);
		}
	}
}
