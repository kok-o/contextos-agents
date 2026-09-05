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
