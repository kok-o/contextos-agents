# NestJS

## Overview

Enterprise Node.js architecture standard using NestJS, TypeScript, and RxJS. Enforces strict modularity, dependency injection, repository pattern, DTO validation via class-validator, and clean layered architecture.

## When to Use

Activate when building enterprise Node.js microservices, complex REST/GraphQL APIs, or scalable backends requiring strict architectural structure.

## Rules & Patterns
<!-- Source: nestjs.md -->

## NestJS — Best Practices

## Module Architecture

- **One module per domain** — `UsersModule`, `AuthModule`, `OrdersModule`
- **Feature modules** — encapsulate related controllers, services, repositories
- **Shared module** — for cross-cutting concerns (logging, config, utils)
- **Core module** — singleton services (database, auth guards)

```
src/
├── modules/
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── dto/
│   │   │   ├── create-user.dto.ts
│   │   │   └── update-user.dto.ts
│   │   ├── entities/
│   │   │   └── user.entity.ts
│   │   └── users.spec.ts
│   └── auth/
├── shared/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── filters/
├── config/
└── app.module.ts
```

## Dependency Injection

```typescript
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}
}
```

- Prefer constructor injection
- Use custom providers for complex setup
- Scope: default is Singleton, use REQUEST scope only when needed

## DTOs and Validation

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;
}
```

- Always use DTOs for request validation
- Use `ValidationPipe` globally
- Separate Create/Update/Response DTOs

## Guards, Interceptors, Pipes

| Type | Purpose |
| --- | --- |
| **Guards** | Authentication, authorization |
| **Interceptors** | Logging, transformation, caching |
| **Pipes** | Validation, transformation |
| **Filters** | Exception handling |

Execution order: Guards → Interceptors → Pipes → Handler → Interceptors → Filters

## Error Handling

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Transform to standard error format
  }
}
```

## Testing

- **Unit tests** — mock dependencies with `Test.createTestingModule()`
- **E2E tests** — use `supertest` with a test module
- **Mock everything** — services should be testable in isolation

## Anti-Patterns

- [FAIL] Business logic in controllers — use services
- [FAIL] Direct database access in controllers — use repositories
- [FAIL] Circular dependencies — refactor module structure
- [FAIL] God modules — split large modules by domain
- [FAIL] Not using DTOs — always validate input


## Code Examples

See `EXAMPLES.md` for detailed code examples.

## Validation Checklist

What to verify during the review phase before completing the task.

## Common Mistakes

Anti-patterns and things to explicitly avoid. See `TROUBLESHOOTING.md`.

## Integration Notes

How this skill interacts with other skills.


# nestjs Examples — Anti-patterns vs ContextOS Standard

## Example 1: Input Validation and DTOs

### Anti-pattern: Untyped Body or Manual Validation in Controller

```typescript
// BAD: No runtime validation, controller stuffed with business rules
@Post('users')
async create(@Body() body: any) {
  if (!body.email || !body.email.includes('@')) {
    throw new BadRequestException('Invalid email');
  }
  return this.usersService.create(body);
}
```

### Best practice: ContextOS Standard (Class-Validator DTO + ValidationPipe)

```typescript
// GOOD: Declarative runtime validation with clean separation
export class CreateUserDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

# nestjs Troubleshooting & Common Mistakes

## 1. Circular Dependency Between Modules

- **Symptom**: "Nest cannot create the module instance. Often, this is caused by circular dependencies".
- **Root Cause**: Module A imports Module B, and Module B imports Module A.
- **Fix**: Use `forwardRef(() => ModuleB)` in imports and `@Inject(forwardRef(() => ServiceB))` in constructors, or refactor shared logic into a separate CommonModule.

## 2. Memory Leaks from REQUEST Scope

- **Symptom**: High memory usage and slow performance under load.
- **Root Cause**: Providers declared with Scope.REQUEST recreate instances on every HTTP request.
- **Fix**: Keep services as default Singletons whenever possible. Pass request-scoped parameters directly through method arguments.

## 3. Uncaught Domain Exceptions

- **Symptom**: Custom domain exceptions bypass formatting and return generic 500 errors.
- **Root Cause**: Missing custom Global Exception Filter.
- **Fix**: Implement an AllExceptionsFilter implementing ExceptionFilter and bind it globally in main.ts.