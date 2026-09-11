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
