# API Design - Examples & Best Practices

## Example 1: Contract-First Interface with Zod & TypeScript

```typescript
import { z } from 'zod';

// 1. Unified Contract Definition
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title exceeds max length'),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium')
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  createdAt: string; // ISO 8601 string
}

export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

// 2. Safe Edge Controller
export async function handleCreateTask(
  body: unknown,
  createTaskService: (input: CreateTaskInput) => Promise<TaskDTO>
): Promise<{ status: number; data: TaskDTO | APIErrorResponse }> {
  const result = CreateTaskSchema.safeParse(body);

  if (!result.success) {
    return {
      status: 422,
      data: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request payload failed schema validation',
          details: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      }
    };
  }

  const task = await createTaskService(result.data);
  return { status: 201, data: task };
}
```

---

## Example 2: Idempotent Mutation Handler

```typescript
import crypto from 'node:crypto';

interface IdempotencyStore {
  get(key: string): Promise<{ status: number; body: unknown } | null>;
  set(key: string, result: { status: number; body: unknown }, ttlSeconds: number): Promise<void>;
}

export async function withIdempotency<T>(
  key: string | undefined,
  store: IdempotencyStore,
  handler: () => Promise<{ status: number; body: T }>
): Promise<{ status: number; body: T }> {
  if (!key) {
    return handler();
  }

  const cached = await store.get(key);
  if (cached) {
    return cached as { status: number; body: T };
  }

  const response = await handler();
  await store.set(key, response, 86400); // 24-hour cache
  return response;
}
```
